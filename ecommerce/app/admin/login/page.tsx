import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accesso" };

export default async function AdminLoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="card w-full max-w-sm p-8">
        <p className="text-center font-script text-4xl text-terracotta">Sessa</p>
        <h1 className="mt-1 text-center text-sm font-semibold uppercase tracking-[0.3em] text-ink/50">
          Gestionale
        </h1>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
