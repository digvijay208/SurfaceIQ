export interface PromptBlueprint {
  title: string;
  prompt: string;
  generatedGoal: string;
  references: string[];
}

export function buildPromptBlueprint(prompt: string): PromptBlueprint {
  const normalizedPrompt = prompt.trim() || "security check";
  const lower = normalizedPrompt.toLowerCase();

  if (lower.includes("security")) {
    return {
      title: normalizedPrompt,
      prompt: normalizedPrompt,
      generatedGoal:
        "Navigate to the target web application URL, inspect browser-visible response headers, cookies, forms, scripts, and navigation flows, and analyze them for missing security headers, weak cookie settings, reflected input risk, information disclosure, insecure form handling, and other external web security issues. Return the findings in a structured report with severity, recommendations, and best practices observed.",
      references: [
        "https://www.ssllabs.com/ssltest/",
        "https://securityheaders.com",
        "https://www.virustotal.com"
      ]
    };
  }

  if (lower.includes("login") || lower.includes("auth")) {
    return {
      title: normalizedPrompt,
      prompt: normalizedPrompt,
      generatedGoal:
        "Authenticate into the target web application using supplied credentials or an imported session, verify access to the protected area, capture live browser steps, and summarize the reachable application surface and security posture in a structured report.",
      references: ["https://playwright.dev", "https://owasp.org/www-project-web-security-testing-guide/"]
    };
  }

  return {
    title: normalizedPrompt,
    prompt: normalizedPrompt,
    generatedGoal:
      "Navigate to the target web application, inspect the live browser experience, gather relevant artifacts, and compile the results into a structured report.",
    references: ["https://playwright.dev"]
  };
}
