import { differenceInCalendarDays, format, parseISO, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { z } from "zod";

export type DashboardPeriod = {
  preset: "month" | "3m" | "6m" | "year" | "custom";
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

export function todayInBrazil(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function parseDashboardPeriod(params: Record<string, string | string[] | undefined>, today = todayInBrazil()): DashboardPeriod {
  const preset = typeof params.period === "string" ? params.period : "month";
  const date = parseISO(today);
  let from: string;
  let to = today;
  let selected: DashboardPeriod["preset"] = "month";

  switch (preset) {
    case "3m": from = format(subMonths(startOfMonth(date), 2), "yyyy-MM-dd"); selected = "3m"; break;
    case "6m": from = format(subMonths(startOfMonth(date), 5), "yyyy-MM-dd"); selected = "6m"; break;
    case "year": from = format(startOfYear(date), "yyyy-MM-dd"); selected = "year"; break;
    case "custom": {
      const candidateFrom = typeof params.from === "string" ? params.from : "";
      const candidateTo = typeof params.to === "string" ? params.to : "";
      if (z.iso.date().safeParse(candidateFrom).success && z.iso.date().safeParse(candidateTo).success
        && candidateFrom <= candidateTo
        && differenceInCalendarDays(parseISO(candidateTo), parseISO(candidateFrom)) <= 1095) {
        from = candidateFrom; to = candidateTo; selected = "custom"; break;
      }
      from = format(startOfMonth(date), "yyyy-MM-dd"); break;
    }
    default: from = format(startOfMonth(date), "yyyy-MM-dd");
  }

  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  return {
    preset: selected, from, to,
    previousTo: format(subDays(parseISO(from), 1), "yyyy-MM-dd"),
    previousFrom: format(subDays(parseISO(from), days), "yyyy-MM-dd"),
  };
}
