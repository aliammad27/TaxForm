"use client";

import { use, useActionState } from "react";
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

type SignupTier = "residential_diy" | "commercial_contingency" | "full_service";

function defaultTierFromParams(params: {
  path?: string;
  tier?: string;
}): SignupTier {
  if (params.tier === "full_service") return "full_service";
  if (params.tier === "commercial_contingency") return "commercial_contingency";
  if (params.tier === "residential_diy") return "residential_diy";
  if (params.path === "commercial") return "commercial_contingency";
  return "residential_diy";
}

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; path?: string; tier?: string }>;
}) {
  const params = use(searchParams);
  const { ref } = params;
  const defaultTier = defaultTierFromParams(params);
  const [state, action, pending] = useActionState(signUp, initialState);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-sidebar p-6">
      <Logo className="text-[28px]" />
      <Card className="w-full max-w-[420px] shadow-[0_1px_2px_oklch(0.23_0.012_120_/_0.04),0_16px_40px_-20px_oklch(0.23_0.012_120_/_0.15)]">
        <CardHeader>
          <CardTitle className="font-serif text-2xl font-normal">
            Create an account
          </CardTitle>
          <CardDescription>
            Start appealing your Pennsylvania property assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            {ref && <input type="hidden" name="referral_code" value={ref} />}
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
              <Select name="tier" defaultValue={defaultTier}>
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
            <Button type="submit" className="h-[42px] w-full" disabled={pending}>
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
      <p className="font-mono text-[11.5px] text-muted-foreground">
        Free score first. Appeal letter when you are ready.
      </p>
    </main>
  );
}
