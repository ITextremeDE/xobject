-- Technical retry receipts contain identities/hashes, never business values or credentials.
CREATE TABLE sys_record_creation_requests (
  actor_id text NOT NULL REFERENCES sys_users(id),
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  object_type_id uuid NOT NULL REFERENCES sys_object_types(id),
  record_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY(actor_id, request_id)
);
CREATE INDEX sys_record_creation_requests_expiry ON sys_record_creation_requests(expires_at);
