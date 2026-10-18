import { describe, expect, test } from "bun:test";

import { catalogRefreshTasks } from "./catalogRefresh";

describe("catalogRefreshTasks", () => {
  test("a config rebuild re-reads every list a config file can carry", () => {
    // Agents, commands, skills, MCP servers, plugins and providers remain
    // here. Native search settings are owned by the canonical workspace API.
    expect(catalogRefreshTasks("config")).toHaveLength(6);
  });

  test("a single-catalog rebuild re-reads only that list", () => {
    for (const kind of ["agent", "command", "skill", "plugin", "provider"] as const) {
      expect(catalogRefreshTasks(kind)).toHaveLength(1);
    }
  });

  test("a legacy credential change re-reads providers, not canonical search keys", () => {
    expect(catalogRefreshTasks("credential")).toHaveLength(1);
  });

  test("projects belong to the sync stores, not to the settings lists", () => {
    expect(catalogRefreshTasks("project")).toEqual([]);
  });
});
