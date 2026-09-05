-- Keep revoked Magnus memberships auditable instead of deleting their history.
-- This enum change is isolated so PostgreSQL commits it before later migrations
-- use the new value in constraints and functions.

ALTER TYPE public.magnus_membership_status ADD VALUE IF NOT EXISTS 'disabled';
