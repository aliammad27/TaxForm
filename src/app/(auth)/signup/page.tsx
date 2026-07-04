"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: AuthState = {};

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, initialState);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_25rem_at_50%_-10%,--alpha(var(--color-primary)/8%),transparent)]"
      />
      <Logo className="relative" />
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Create an account</CardTitle>
          <CardDescription>
            Start appealing your Allegheny County property assessment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <Select name="tier" defaultValue="residential_diy">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential_diy">Residential (DIY)</SelectItem>
                  <SelectItem value="commercial_contingency">
                    Commercial (contingency)
                  </SelectItem>
                  <SelectItem value="full_service">Full service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline underline-offset-2"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
