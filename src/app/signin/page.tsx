"use client";

import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";

export default function SignInPage() {
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      console.log("User signed in:", result.user);
      router.push("/"); // ✅ Redirect to home after login
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 text-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white/70 backdrop-blur-md p-10 rounded-3xl shadow-lg max-w-sm w-full text-center"
      >
        <h1 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-400">
          Welcome to Study App
        </h1>
        <p className="text-gray-600 mb-8">Sign in to continue</p>

        <button
          onClick={handleSignIn}
          className="flex items-center justify-center gap-3 mx-auto bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-3 rounded-lg shadow-md transition-all duration-300"
        >
          <Image
            src="https://www.svgrepo.com/show/355037/google.svg"
            alt="Google"
            width={22}
            height={22}
          />
          Sign in with Google
        </button>
      </motion.div>
    </main>
  );
}
