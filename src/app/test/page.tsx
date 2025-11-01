"use client";
import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function TestPage() {
  useEffect(() => {
    async function fetchData() {
      const snapshot = await getDocs(collection(db, "test"));
      snapshot.forEach((doc) => console.log(doc.id, "=>", doc.data()));
    }
    fetchData();
  }, []);

  return <div className="p-10 text-lg text-blue-600">Firebase Connected ✅</div>;
}
