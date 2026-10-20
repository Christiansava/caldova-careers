/**
 * Pure, side-effect-free helpers for working with job postings.
 *
 * These operate on plain `Job[]` arrays (already loaded from the content
 * collection by the calling page) so they can be unit tested without the Astro
 * content runtime or a database.
 */
import type { Job } from '../types/job';

/**
 * Derives department options from the complete postings list.
 *
 * @param jobs - Plain job postings from the content collection.
 * @returns Unique department labels in English alphabetical order.
 */
export function getDepartments(jobs: Job[]): string[] {
  return [...new Set(jobs.map((job) => job.department))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
}

/**
 * Derives location options without grouping or rewriting remote labels.
 *
 * @param jobs - Plain job postings from the content collection.
 * @returns Unique location labels in English alphabetical order.
 */
export function getLocations(jobs: Job[]): string[] {
  return [...new Set(jobs.map((job) => job.location))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
}

/**
 * Filters roles by exact department and location matches, combined with AND.
 *
 * @param jobs - Roles in their desired display order; the array is not mutated.
 * @param filters - Selected labels; omitted or empty values leave that field unconstrained.
 * @returns Matching roles in input order, or an empty array when no roles match.
 */
export function filterJobs(
  jobs: Job[],
  filters: { department?: string; location?: string },
): Job[] {
  return jobs.filter(
    (job) =>
      (!filters.department || job.department === filters.department) &&
      (!filters.location || job.location === filters.location),
  );
}

/** Return jobs sorted by posted date, newest first (does not mutate input). */
export function sortByNewest(jobs: Job[]): Job[] {
    return [...jobs].sort(
        (a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime(),
    );
}

/**
 * Format an ISO-8601 date as a human-readable posted date,
 * e.g. "January 5, 2027". Falls back to the raw value if unparseable.
 */
export function formatPostedDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return iso;
    }
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}
