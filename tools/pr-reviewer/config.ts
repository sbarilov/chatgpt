import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface RoleConfig {
  name: string;
  instructions: string;
  additionalInstructions?: string;
}

export interface CouncilConfig {
  repo?: string;
  models: string[];
  style: "sequential" | "roundtable" | "synthesis";
  rounds: number;
  useRoles: boolean;
  systemInstructions?: string;
  roles: RoleConfig[];
  jira?: {
    baseUrl: string;
    userEmail: string;
  };
}

const DEFAULT_ROLES: RoleConfig[] = [
  {
    name: "Security Reviewer",
    instructions:
      "Focus on vulnerabilities, injection attacks, authentication issues, secret exposure, unsafe data handling, and XSS/CSRF risks.",
  },
  {
    name: "Architect",
    instructions:
      "Focus on system design, separation of concerns, API contracts, component boundaries, dependency direction, and whether the change fits the broader codebase architecture.",
  },
  {
    name: "Bug Hunter",
    instructions:
      "Focus on logic errors, off-by-one mistakes, edge cases, race conditions, null/undefined handling, and incorrect assumptions.",
  },
  {
    name: "Engineering Best Practices",
    instructions:
      "Focus on error handling, logging, naming conventions, DRY violations, SOLID principles, proper use of language/framework idioms, and code that will be easy to debug in production.",
  },
  {
    name: "Maintainability & Tests",
    instructions:
      "Focus on test coverage for new code, test quality, missing edge case tests, code that will be hard to maintain or extend, unclear abstractions, and future technical debt.",
  },
];

const DEFAULT_CONFIG: CouncilConfig = {
  models: ["gpt-5.4", "gpt-5.3-chat-latest", "o3", "gpt-5.2", "gpt-5.4-mini"],
  style: "sequential",
  rounds: 2,
  useRoles: true,
  roles: DEFAULT_ROLES,
};

function findConfigFile(): string | null {
  const names = [".council-review.json", "council-review.json"];
  let dir = process.cwd();

  // Walk up directories looking for config
  while (true) {
    for (const name of names) {
      const path = resolve(dir, name);
      if (existsSync(path)) return path;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(configPath?: string): CouncilConfig {
  const path = configPath || findConfigFile();

  if (!path) {
    return { ...DEFAULT_CONFIG };
  }

  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  try {
    const raw = readFileSync(path, "utf8");
    const userConfig = JSON.parse(raw);

    // Merge roles: user can override specific roles or add new ones
    let roles = [...DEFAULT_ROLES];
    if (userConfig.roles && Array.isArray(userConfig.roles)) {
      const userRoleMap = new Map<string, Partial<RoleConfig>>();
      for (const r of userConfig.roles) {
        if (r.name) userRoleMap.set(r.name, r);
      }

      // Update existing roles with user overrides
      roles = roles.map((defaultRole) => {
        const override = userRoleMap.get(defaultRole.name);
        if (override) {
          userRoleMap.delete(defaultRole.name);
          return {
            ...defaultRole,
            ...(override.instructions !== undefined && { instructions: override.instructions }),
            ...(override.additionalInstructions !== undefined && {
              additionalInstructions: override.additionalInstructions,
            }),
          };
        }
        return defaultRole;
      });

      // Add any new roles the user defined
      for (const [, r] of userRoleMap) {
        if (r.name && r.instructions) {
          roles.push(r as RoleConfig);
        }
      }
    }

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      roles,
    };
  } catch (err: any) {
    throw new Error(`Failed to parse config file ${path}: ${err.message}`);
  }
}

export function loadEnvFile(): void {
  const envPaths = [".env.local", ".env"];
  for (const envFile of envPaths) {
    const path = resolve(process.cwd(), envFile);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Don't override existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    break; // Only load the first found env file
  }
}

export function resolveEnv(config: CouncilConfig): void {
  // Set Jira env vars from config if not already set
  if (config.jira) {
    if (!process.env.JIRA_BASE_URL && config.jira.baseUrl) {
      process.env.JIRA_BASE_URL = config.jira.baseUrl;
    }
    if (!process.env.JIRA_USER_EMAIL && config.jira.userEmail) {
      process.env.JIRA_USER_EMAIL = config.jira.userEmail;
    }
  }
}
