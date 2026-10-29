import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { signIn, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ThemeSelect } from './preferences';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const { t, i18n } = useTranslation();
  const mutation = useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => signIn(email, password), onSuccess });
  return <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-10">
    <div className="text-3xl font-semibold tracking-tight">xObject</div>
    <Card className="w-full max-w-sm">
      <CardHeader><CardTitle>{t('signIn')}</CardTitle><CardDescription>{t('loginDescription')}</CardDescription></CardHeader>
      <CardContent>
        <form id="login" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); mutation.mutate({ email: String(data.get('email')), password: String(data.get('password')) }); }}>
          <FieldGroup>
            {mutation.isError ? <Alert variant="destructive"><AlertDescription>{t(mutation.error instanceof ApiError && mutation.error.status === 401 ? 'loginFailed' : 'networkError')}</AlertDescription></Alert> : null}
            <Field><FieldLabel htmlFor="email">{t('email')}</FieldLabel><Input autoFocus id="email" name="email" type="email" autoComplete="username" required disabled={mutation.isPending} /></Field>
            <Field><FieldLabel htmlFor="password">{t('password')}</FieldLabel><Input id="password" name="password" type="password" autoComplete="current-password" required disabled={mutation.isPending} /></Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter><Button form="login" type="submit" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? t('loading') : t('signIn')}</Button></CardFooter>
    </Card>
    <div className="flex w-full max-w-sm gap-3">
      <Field><FieldLabel htmlFor="login-language" className="sr-only">{t('language')}</FieldLabel><NativeSelect id="login-language" className="w-full" value={i18n.language} onChange={event => { void i18n.changeLanguage(event.target.value); }}><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field>
      <ThemeSelect />
    </div>
  </main>;
}
