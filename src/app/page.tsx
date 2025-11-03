"use client";
import { useEffect, useState } from "react";
import { auth } from "../lib/firebase"; // adjust path if needed
import { useRouter } from "next/navigation";
import { User } from "firebase/auth";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.push("/signin");
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (!user) return <div>Loading...</div>;

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "sans-serif",
      }}
    >
      <h1>Welcome back, {user.displayName?.split(" ")[0]} 👋</h1>
      <p>Your focus space for today awaits.</p>

      <div style={{ marginTop: "2rem", display: "flex", gap: "2rem" }}>
        <button
          onClick={() => router.push("/notes")}
          style={buttonStyle}
        >
          📝 Notes
        </button>
        <button
          onClick={() => router.push("/tasks")}
          style={buttonStyle}
        >
          ✅ Tasks
        </button>
        <button
          onClick={() => router.push("/calendar")}
          style={buttonStyle}
        >
          📅 Calendar
        </button>
      </div>

      <div style={{ marginTop: "4rem" }}>
        <h3>📊 Your Daily Progress</h3>
        <div
          style={{
            width: "300px",
            height: "20px",
            borderRadius: "10px",
            backgroundColor: "#e5e5e5",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "60%", // mock progress value
              height: "100%",
              backgroundColor: "#4CAF50",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <p style={{ marginTop: "8px" }}>You’ve completed 60% of your goals today!</p>
      </div>
    </main>
  );
}

const buttonStyle = {
  backgroundColor: "#1E88E5",
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "1rem",
};
