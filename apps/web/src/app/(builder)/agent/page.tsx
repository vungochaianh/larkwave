import { redirect } from "next/navigation";

/** Moved into the "Điều khiển từ xa" group. Keep old links / bookmarks working. */
export default function AgentMoved() {
  redirect("/remote/agent");
}
