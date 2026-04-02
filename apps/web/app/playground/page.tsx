import Link from "next/link";

import { PlaygroundRunner } from "../../components/playground-runner";
import { isShowcaseMode } from "../../lib/app-mode";
import { getCurrentUser } from "../../lib/auth";
import { buildPromptBlueprint } from "../../lib/playground";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage(props: {
  searchParams: Promise<{ prompt?: string; target?: string; autorun?: string }>;
}) {
  const searchParams = await props.searchParams;
  const prompt = searchParams.prompt ?? "security check";
  const blueprint = buildPromptBlueprint(prompt);
  const user = await getCurrentUser();
  const showcaseMode = isShowcaseMode();

  return (
    <main className="playground-page">
      <header className="playground-topbar">
        <Link className="playground-brand" href="/">
          <span className="workspace-brand-mark">S</span>
          <span>SurfaceIQ</span>
        </Link>
      </header>

      <PlaygroundRunner
        autoRun={searchParams.autorun === "1"}
        generatedGoal={blueprint.generatedGoal}
        initialTargetUrl={searchParams.target ?? ""}
        isAuthenticated={Boolean(user)}
        prompt={blueprint.prompt}
        references={blueprint.references}
        showcaseMode={showcaseMode}
      />
    </main>
  );
}
