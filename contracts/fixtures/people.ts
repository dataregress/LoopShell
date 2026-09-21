import type { Person } from '../schemas/common';

/** Fictional cast. No real names, tenants or identifiers. */
export const ME: Person = { userId: 'u-1001', displayName: 'Sara Al Nuaimi', department: 'Technology' };
export const REEM: Person = { userId: 'u-1002', displayName: 'Reem Al Mazrouei', department: 'Client Services' };
export const OMAR: Person = { userId: 'u-1003', displayName: 'Omar Haddad', department: 'Finance Analytics' };
export const AHMED: Person = { userId: 'u-1004', displayName: 'Ahmed Khan', department: 'IT Service Desk' };
export const LAYLA: Person = { userId: 'u-1005', displayName: 'Layla Hassan', department: 'Facilities' };

export const ME_UPN = 'sara.alnuaimi@example.com';
export const TENANT_ID = '00000000-0000-4000-8000-00000000c0de';

export const PEOPLE: Person[] = [ME, REEM, OMAR, AHMED, LAYLA];
