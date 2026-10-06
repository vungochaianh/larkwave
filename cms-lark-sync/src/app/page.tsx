"use client";

import Image from "next/image";
import Link from "next/link";

export default function Admin() {
  return (
    <div className="w-full h-[100vh] flex justify-center items-center">
      <Link className="flex gap-2 justify-center items-center" href="/">
        <Image
          src="/logo.png"
          alt=""
          width={60}
          height={60}
          className="object-contain"
        />
        <h2 className="font-bold archivo-black-regular text-[var(--primary-color)]">
          Lark.
        </h2>
      </Link>
    </div>
  );
}
