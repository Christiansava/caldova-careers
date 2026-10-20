import { describe, it, expect } from 'vitest';
import { sortByNewest, formatPostedDate, getDepartments, getLocations, filterJobs } from './jobs';
import type { Job } from '../types/job';

function makeJob(slug: string, postedDate: string): Job {
    return {
        slug,
        title: `Role ${slug}`,
        department: 'Technology',
        location: 'Remote',
        type: 'Full-time',
        remote: true,
        postedDate,
        summary: 'A role.',
    };
}

describe('sortByNewest', () => {
    it('orders jobs by posted date, newest first', () => {
        const jobs = [
            makeJob('a', '2027-01-01'),
            makeJob('b', '2027-03-15'),
            makeJob('c', '2027-02-10'),
        ];
        expect(sortByNewest(jobs).map((j) => j.slug)).toEqual(['b', 'c', 'a']);
    });

    it('does not mutate the input array', () => {
        const jobs = [makeJob('a', '2027-01-01'), makeJob('b', '2027-03-15')];
        const original = jobs.map((j) => j.slug);
        sortByNewest(jobs);
        expect(jobs.map((j) => j.slug)).toEqual(original);
    });
});

describe('formatPostedDate', () => {
    it('formats an ISO date as a readable string', () => {
        expect(formatPostedDate('2027-01-05')).toBe('January 5, 2027');
    });

    /** Ordered postings with shared and distinct values for filtering and reset scenarios. */
    const filterJobsFixture: Job[] = [
      { ...makeJob('finance-local', '2027-03-01'), department: 'Finance', location: 'Woodinville, WA, USA' },
      { ...makeJob('technology-remote', '2027-02-01'), location: 'Remote (US & Canada)' },
      { ...makeJob('finance-helsinki', '2027-01-01'), department: 'Finance', location: 'Helsinki, Finland' },
      { ...makeJob('technology-remote-older', '2026-12-01'), location: 'Remote (US & Canada)' },
    ];

    describe('filter options', () => {
      it('returns unique departments and locations in alphabetical order', () => {
        expect(getDepartments(filterJobsFixture)).toEqual(['Finance', 'Technology']);
        expect(getLocations(filterJobsFixture)).toEqual([
          'Helsinki, Finland',
          'Remote (US & Canada)',
          'Woodinville, WA, USA',
        ]);
      });

      it('returns no options for an empty list', () => {
        expect(getDepartments([])).toEqual([]);
        expect(getLocations([])).toEqual([]);
      });
    });

    describe('filterJobs', () => {
      it.each([
        { filters: { department: 'Finance' }, expected: ['finance-local', 'finance-helsinki'] },
        { filters: { location: 'Remote (US & Canada)' }, expected: ['technology-remote', 'technology-remote-older'] },
        { filters: { department: 'Finance', location: 'Woodinville, WA, USA' }, expected: ['finance-local'] },
        { filters: { department: 'Technology', location: 'Woodinville, WA, USA' }, expected: [] },
        { filters: { department: 'Unknown' }, expected: [] },
        { filters: { location: 'Unknown' }, expected: [] },
        { filters: { department: 'finance' }, expected: [] },
      ])('matches exact selections with AND: $filters', ({ filters, expected }) => {
        expect(filterJobs(filterJobsFixture, filters).map((job) => job.slug)).toEqual(expected);
      });

      it('clears either constraint independently and both to restore the original list', () => {
        expect(filterJobs(filterJobsFixture, {
          department: '',
          location: 'Remote (US & Canada)',
        }).map((job) => job.slug)).toEqual(['technology-remote', 'technology-remote-older']);
        expect(filterJobs(filterJobsFixture, {
          department: 'Finance',
          location: '',
        }).map((job) => job.slug)).toEqual(['finance-local', 'finance-helsinki']);
        expect(filterJobs(filterJobsFixture, { department: '', location: '' })).toEqual(filterJobsFixture);
        expect(filterJobs(filterJobsFixture, {})).toEqual(filterJobsFixture);
      });

      it('returns no matches from an empty list', () => {
        expect(filterJobs([], { department: 'Finance' })).toEqual([]);
      });

      it('preserves input order and does not mutate jobs', () => {
        const original = structuredClone(filterJobsFixture);
        const result = filterJobs(filterJobsFixture, { department: 'Technology' });
        expect(result).toEqual([filterJobsFixture[1], filterJobsFixture[3]]);
        expect(filterJobsFixture).toEqual(original);
        expect(result).not.toBe(filterJobsFixture);
      });
    });

    it('returns the raw value when the date is unparseable', () => {
        expect(formatPostedDate('not-a-date')).toBe('not-a-date');
    });
});
