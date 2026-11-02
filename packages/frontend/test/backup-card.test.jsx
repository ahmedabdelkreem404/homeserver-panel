import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BackupCard from "../src/pages/settings/BackupCard.jsx";
import { apiError, fakeApi, renderWithProviders } from "./fakes.jsx";

describe("backup card", () => {
  it("shows the newest backup and offers the download as a plain link", async () => {
    const api = fakeApi({ "GET /api/settings/backups": { backups: [{ file: "panel-20261102-030000.db", size: 20480, at: new Date().toISOString() }] } });
    renderWithProviders(<BackupCard />, api);
    expect(await screen.findByText(/آخر نسخة/)).toHaveTextContent("20.0 KB");
    const link = screen.getByRole("link", { name: "تنزيل نسخة دلوقتي" });
    expect(link).toHaveAttribute("href", "/api/settings/backup");
    expect(link).toHaveAttribute("download");
  });

  it("says so when no automatic backup exists yet, and shows a failure to load", async () => {
    renderWithProviders(<BackupCard />, fakeApi({ "GET /api/settings/backups": { backups: [] } }));
    expect(await screen.findByText(/لسه مفيش نسخة تلقائية/)).toBeInTheDocument();
    renderWithProviders(<BackupCard />, fakeApi({ "GET /api/settings/backups": apiError("internal_error", 500) }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
