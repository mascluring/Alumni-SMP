import React, { useMemo } from 'react';
import type { AlumniRecord } from '../types/alumni';

interface StatsViewProps {
  alumniList: AlumniRecord[];
}

export const StatsView: React.FC<StatsViewProps> = ({ alumniList }) => {
  const stats = useMemo(() => {
    const cityCounts = new Map<string, number>();
    const yearCounts = new Map<string, number>();

    for (const item of alumniList) {
      cityCounts.set(item.city, (cityCounts.get(item.city) ?? 0) + 1);
      yearCounts.set(item.angkatan, (yearCounts.get(item.angkatan) ?? 0) + 1);
    }

    const topCities = Array.from(cityCounts.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    const byYear = Array.from(yearCounts.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => Number(a.year) - Number(b.year));

    const numericYears = byYear.map((y) => Number(y.year)).filter((n) => Number.isFinite(n));
    const minYear = numericYears.length > 0 ? Math.min(...numericYears) : null;
    const maxYear = numericYears.length > 0 ? Math.max(...numericYears) : null;

    return {
      total: alumniList.length,
      cityCount: topCities.length,
      topCity: topCities[0] ?? null,
      yearRange: minYear && maxYear ? `${minYear}–${maxYear}` : '-',
      topCities,
      byYear,
    };
  }, [alumniList]);

  const maxCityCount = stats.topCities[0]?.count ?? 1;
  const maxYearCount = Math.max(...stats.byYear.map((y) => y.count), 1);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Statistik Angkatan &amp; Wilayah
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ringkasan distribusi domisili kota dan sebaran tahun lulus alumni SMP.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Alumni
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.total}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Kota Terjangkau
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.cityCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Rentang Angkatan
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.yearRange}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Konsentrasi Tertinggi
          </div>
          <div className="mt-1 truncate font-display text-lg font-bold text-sky-700 dark:text-sky-400">
            {stats.topCity ? `${stats.topCity.city} (${stats.topCity.count})` : '-'}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
            Sebaran per Kota
          </h2>
          <div className="mt-4 space-y-3">
            {stats.topCities.map(({ city, count }) => {
              const pct = Math.round((count / maxCityCount) * 100);
              return (
                <div key={city}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{city}</span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {count} alumni
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-md bg-sky-600 dark:bg-sky-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
            Sebaran per Angkatan
          </h2>
          <div className="mt-4 space-y-3">
            {stats.byYear.map(({ year, count }) => {
              const pct = Math.round((count / maxYearCount) * 100);
              return (
                <div key={year}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
                      Angkatan {year}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {count} alumni
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-md bg-slate-900 dark:bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
