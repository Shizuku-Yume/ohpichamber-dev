
export type CountedText = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface ToastLine {
  title: string;
  description: string;
}

export interface EasterEggCopy {
  draftTitle: {
    everyday: readonly string[];
    deepNight: readonly string[];
    halloween: readonly string[];
    newYearsEve: readonly string[];
    newYearsDay: readonly string[];
  };
  gitClean: {
    everyday: readonly string[];
    halloween: readonly string[];
    newYearsEve: readonly string[];
    newYearsDay: readonly string[];
  };
  push: {
    fridayEvening: readonly ToastLine[];
    smallHours: readonly ToastLine[];
  };
  /** A commit that removes clearly more lines than it adds. Titles contain `{count}`. */
  netDeletionCommit: readonly { title: CountedText; description: string }[];
}
