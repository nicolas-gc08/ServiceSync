import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, LogOut } from "lucide-react";
import { useGetAuthStatus, useAdminLogout, getGetAuthStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: authStatus, isLoading } = useGetAuthStatus();
  const logout = useAdminLogout();

  useEffect(() => {
    document.title = "ServiceSync | Review Portal";
  }, []);

  useEffect(() => {
    if (!isLoading && !authStatus?.authenticated) {
      setLocation("/admin/login");
    }
  }, [isLoading, authStatus, setLocation]);

  const handleLogout = async () => {
    await logout.mutateAsync();
    queryClient.setQueryData(getGetAuthStatusQueryKey(), { authenticated: false, username: null });
    setLocation("/admin/login");
  };

  if (isLoading || !authStatus?.authenticated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      <header className="sticky top-0 z-10 w-full border-b bg-white">
        <div className="container flex h-16 items-center px-4 mx-auto max-w-6xl justify-between">
          <div className="flex items-center gap-2 font-semibold text-primary cursor-pointer" onClick={() => setLocation("/admin")}>
            <img src="/logo.png" alt="ServiceSync" className="h-6 w-6 object-contain" />
            <span>ServiceSync</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">
              Logged in as {authStatus.username}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} disabled={logout.isPending}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full mx-auto max-w-6xl p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
