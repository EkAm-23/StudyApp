"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { signOut } from "firebase/auth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user] = useAuthState(auth);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/signin");
  };

  // Don't show navbar on signin page
  if (pathname === "/signin") return null;

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Notes", path: "/notes" },
    { name: "Tasks", path: "/tasks" },
    { name: "Calendar", path: "/calendar" },
    { name: "Progress", path: "/progress" },
  ];

  return (
    <nav className="bg-white/70 backdrop-blur-md border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <button
              onClick={() => router.push("/")}
              className="text-3xl font-bold text-blue-500 hover:text-blue-700 transition-colors"
            >
              📚 StudyApp
            </button>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => router.push(link.path)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  pathname === link.path
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-blue-50"
                }`}
              >
                {link.name}
              </button>
            ))}
          </div>

          {/* User Actions */}
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="hidden md:flex items-center gap-2 text-sm text-gray-700">
                  <Image
                    src={user.photoURL || "https://via.placeholder.com/32"}
                    alt={user.displayName || "Profile"}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                  <span className="font-medium">{user.displayName}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors text-sm"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3 flex gap-2 overflow-x-auto">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => router.push(link.path)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                pathname === link.path
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-blue-50"
              }`}
            >
              {link.name}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
