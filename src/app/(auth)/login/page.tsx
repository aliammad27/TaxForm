"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInWithPassword, signInWithMagicLink, type AuthState } from "../actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const initialState: AuthState = {};

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, initialState);
  const [mlState, mlAction, mlPending] = useActionState(signInWithMagicLink, initialState);

  return (
    <Card className="w-full max-w-[420px] shadow-[0_1px_2px_oklch(0.23_0.012_120_/_0.04),0_16px_40px_-20px_oklch(0.23_0.012_120_/_0.15)]">
      <CardHeader>
        <CardTitle className="font-serif text-2xl font-normal">Welcome back</CardTitle>
        <CardDescription>Access your property tax appeal dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password">
          <TabsList className="grid w-full grid-cols-2 bg-muted p-[3px]">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="magic">Magic link</TabsTrigger>
          </TabsList>
          <TabsContent value="password">
            <form action={pwAction} className="space-y-4 pt-2">
              <input type="hidden" name="next" value={next} />
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              {pwState.error && <p className="text-sm text-destructive">{pwState.error}</p>}
              <Button type="submit" className="h-[42px] w-full" disabled={pwPending}>
                {pwPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="magic">
            <form action={mlAction} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="ml-email">Email</Label>
                <Input id="ml-email" name="email" type="email" required />
              </div>
              {mlState.error && <p className="text-sm text-destructive">{mlState.error}</p>}
              {mlState.message && <p className="text-sm text-success">{mlState.message}</p>}
              <Button type="submit" className="h-[42px] w-full" disabled={mlPending}>
                {mlPending ? "Sending..." : "Email me a sign-in link"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary underline underline-offset-2"
          >
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-sidebar p-6">
      <Logo className="text-[28px]" />
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="font-mono text-[11.5px] text-muted-foreground">
        Property tax appeals, built on the counties&apos; own data.
      </p>
    </main>
  );
}
