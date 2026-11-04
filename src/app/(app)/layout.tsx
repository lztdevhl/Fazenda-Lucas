import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { requireOwner } from "@/lib/auth";
import { listFarmUnits } from "@/lib/farm-units/repository";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, farm } = await requireOwner();
  if (!farm) redirect("/access-pending");
  const { data: user } = await supabase.auth.getUser();
  const farmUnits = await listFarmUnits();

  return <div className="min-h-screen"><AppSidebar farmName={farm.name} ownerName={farm.owner_name ?? ""} email={user.user?.email ?? userId} farmUnits={farmUnits} /><div className="lg:pl-68"><main className="mx-auto w-full max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main></div></div>;
}
