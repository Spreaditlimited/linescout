"use client";

type NavbarUser = {
  pidUser: string;
};

type NavbarAuth = {
  user: NavbarUser | null;
  logout: () => Promise<void>;
};

/** Compatibility adapter for the unmodified Sure Imports navbar. */
export function useAuth(): NavbarAuth {
  return {
    user: null,
    logout: async () => {
      window.location.assign("https://www.sureimports.com/auth/login");
    },
  };
}
