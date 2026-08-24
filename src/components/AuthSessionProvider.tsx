"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { writeSession } from "@/lib/auth-client";
import { hydrateLikesFromProfile } from "@/lib/likes";

function SessionSync() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const didRefreshProfile = useRef(false);
  const didRecordPresence = useRef(false);

  useEffect(() => {
    if (!session?.user?.email) return;
    writeSession({
      name: session.user.name?.trim() || session.user.email,
      email: session.user.email,
    });
    if (!session.staffRole && !didRecordPresence.current) {
      didRecordPresence.current = true;
      void fetch("/api/account/presence", { method: "POST" });
    }
    void hydrateLikesFromProfile().then((favorites) => {
      if (pathname === "/profile" && favorites.length && !didRefreshProfile.current) {
        didRefreshProfile.current = true;
        router.refresh();
      }
    });
  }, [session, pathname, router]);

  return null;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionSync />
      {children}
    </SessionProvider>
  );
}
