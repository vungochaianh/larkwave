import SkillsPage from "@/app/(builder)/skills/page";

// Skills inside the /agents-chat workspace — the same server-side Skills page, wrapped for the rail.
export default function AgentsChatSkills() {
  return (
    <div style={{ padding: "24px 20px 48px" }}>
      <SkillsPage />
    </div>
  );
}
