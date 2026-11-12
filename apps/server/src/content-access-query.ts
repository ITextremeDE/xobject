import {sql, type RawBuilder} from 'kysely';
import {accessRank, membershipRights, principalKey} from '@xobject/contracts';
import type {securityGraph} from './ownership-settings.js';

type Graph = Awaited<ReturnType<typeof securityGraph>>;
const levels = sql`ARRAY['none','availability','read','duplicate','schedule','edit','delete','full']::text[]`;
const rank = (value: RawBuilder<unknown>) => sql<number>`COALESCE(array_position(${levels},${value})-1,0)`;

/** Transaction-local SQL counterpart of the finite contract resolver. Never cache across requests. */
export class ContentAccessQuery {
  private readonly members;
  private readonly rules;
  private readonly memberships;
  constructor(readonly actor: string, objectId: string, graph: Graph, readonly inherit: boolean) {
    this.members = JSON.stringify(graph.members.map(m => ({key: principalKey(m), parent: `group:${m.groupId}`, n: accessRank(m.level)})));
    this.rules = JSON.stringify(graph.rules.map(rule => {
      const config = rule.objects[objectId] ?? rule;
      return {requester: principalKey(rule.requester), owner: principalKey(rule.owner), n: accessRank(config.level), conf: config.confidential ?? rule.confidential};
    }));
    this.memberships = JSON.stringify(Object.fromEntries(graph.users.map(user => [user, Object.fromEntries(membershipRights(user, graph.members))])));
  }

  private owner(policy: RawBuilder<unknown>, user: RawBuilder<unknown>) {
    return sql<number | null>`COALESCE(
      (SELECT ${rank(sql`o->>'level'`)} FROM jsonb_array_elements(${policy}->'owners') o WHERE o->>'kind'='user' AND o->>'id'=${user} LIMIT 1),
      (SELECT max(LEAST(${rank(sql`o->>'level'`)},((${this.memberships}::jsonb)->${user}->>(o->>'id'))::integer))
       FROM jsonb_array_elements(${policy}->'owners') o WHERE o->>'kind'='group'))`;
  }

  level(policy: RawBuilder<unknown>): RawBuilder<number> {
    const foreign = sql<number>`(WITH RECURSIVE
      members AS (SELECT * FROM jsonb_to_recordset(${this.members}::jsonb) AS m(key text,parent text,n integer)),
      rules AS (SELECT * FROM jsonb_to_recordset(${this.rules}::jsonb) AS r(requester text,owner text,n integer,conf boolean)),
      walk(key,n,conf,down,moved) AS (
        SELECT ${`user:${this.actor}`}::text,7,true,false,false
        UNION
        SELECT edge.key,LEAST(adjusted.n,edge.n),walk_state.conf AND edge.conf,edge.down,true
        FROM walk walk_state
        CROSS JOIN LATERAL (SELECT LEAST(walk_state.n,CASE WHEN walk_state.key LIKE 'user:%' THEN COALESCE(${this.owner(policy,sql`substring(walk_state.key from 6)`)},7) ELSE 7 END) AS n) adjusted
        CROSS JOIN LATERAL (
          SELECT m.parent AS key,m.n,true AS conf,false AS down FROM members m WHERE ${this.inherit} AND m.key=walk_state.key
          UNION ALL
          SELECT r.owner,r.n,r.conf,true FROM rules r WHERE r.requester=walk_state.key AND (${this.inherit} OR walk_state.key LIKE 'user:%')
          UNION ALL
          SELECT m.key,m.n,true,true FROM members m WHERE walk_state.down AND m.parent=walk_state.key
        ) edge WHERE LEAST(adjusted.n,edge.n)>0
      )
      SELECT COALESCE(max(LEAST(walk_state.n,${rank(sql`o->>'level'`)},${rank(sql`${policy}->>'foreignMax'`)},
        CASE WHEN walk_state.key LIKE 'user:%' THEN COALESCE(${this.owner(policy,sql`substring(walk_state.key from 6)`)},7) ELSE 7 END)),0)
      FROM walk walk_state JOIN LATERAL jsonb_array_elements(${policy}->'owners') o ON o->>'kind'||':'||(o->>'id')=walk_state.key
      WHERE walk_state.moved AND (${policy}->>'privacy'<>'confidential' OR walk_state.conf))`;
    return sql<number>`COALESCE(${this.owner(policy,sql`${this.actor}`)},
      CASE WHEN ${rank(sql`${policy}->>'publicLevel'`)}>0 THEN ${rank(sql`${policy}->>'publicLevel'`)}
      WHEN ${policy}->>'privacy'='personal' THEN 0 ELSE ${foreign} END)`;
  }

  field(policy: RawBuilder<unknown>, fieldId: string, groups: string[]): RawBuilder<number> {
    return sql<number>`COALESCE(
      (SELECT ${rank(sql`f->'fields'->>${fieldId}`)} FROM jsonb_array_elements(${policy}->'fields') f
       WHERE f->>'kind'='user' AND f->>'id'=${this.actor} AND f->'fields' ? ${fieldId} LIMIT 1),
      (SELECT max(${rank(sql`f->'fields'->>${fieldId}`)}) FROM jsonb_array_elements(${policy}->'fields') f
       WHERE f->>'kind'='group' AND f->>'id'=ANY(${groups}::text[]) AND f->'fields' ? ${fieldId}),7)`;
  }
}
