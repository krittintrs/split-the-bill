"use client";

import { useFormStatus } from "react-dom";

export default function CreateBillButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full rounded-xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
    >
      {pending ? "กำลังสร้าง…" : "+ สร้างบิลใหม่"}
    </button>
  );
}
