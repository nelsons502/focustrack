"use client";

import "./demo.css";
import { useRouter } from "next/navigation";
import { startMayaDemo } from "../../lib/demo/maya";

export default function PlayMyDayButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="demo-play-button"
      onClick={() => {
        startMayaDemo();
        router.push("/now");
      }}
    >
      Play my day
    </button>
  );
}
