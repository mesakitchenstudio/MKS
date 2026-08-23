"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(true);
  }

  if (done) {
    return (
      <p className="border border-line bg-paper p-6 text-sm leading-6 text-olive">
        Thank you. We read every note — if we can help, we will write back.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        Name
        <input
          required
          name="name"
          className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Email
        <input
          required
          type="email"
          name="email"
          className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Message
        <textarea
          required
          name="message"
          rows={5}
          className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      <button
        type="submit"
        className="justify-self-start rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
      >
        Send message
      </button>
    </form>
  );
}
