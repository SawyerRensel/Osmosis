import { describe, it, expect } from "vitest";
import { migrateRenamedSettingKeys } from "./mode-names";

describe("migrateRenamedSettingKeys", () => {
	it("carries each old key over to its new name and drops the old one", () => {
		const data: Record<string, unknown> = {
			contextualAutoActivate: false,
			contextualInlineCloze: true,
			sequentialContextLines: 4,
			newCardsPerDay: 20,
		};
		migrateRenamedSettingKeys(data);
		expect(data).toEqual({
			noteAutoActivate: false,
			noteInlineCloze: true,
			flashcardContextLines: 4,
			newCardsPerDay: 20,
		});
	});

	it("keeps a saved new value over the old one, still dropping the old key", () => {
		const data: Record<string, unknown> = { sequentialContextLines: 4, flashcardContextLines: 1 };
		migrateRenamedSettingKeys(data);
		expect(data).toEqual({ flashcardContextLines: 1 });
	});

	it("carries a zero over rather than treating it as absent", () => {
		const data: Record<string, unknown> = { sequentialContextLines: 0 };
		migrateRenamedSettingKeys(data);
		expect(data).toEqual({ flashcardContextLines: 0 });
	});

	it("leaves already-migrated data alone", () => {
		const data: Record<string, unknown> = { flashcardContextLines: 3 };
		migrateRenamedSettingKeys(data);
		expect(data).toEqual({ flashcardContextLines: 3 });
	});
});
