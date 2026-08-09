-- Record which default-locale value each translation was written against, so
-- that changing a default value can mark the other locales potentially stale
-- without writing to their rows.
--
-- NULL means "never recorded" and reads as in sync, which is what existing rows
-- want: nothing becomes stale on upgrade, only on the next real change to a
-- default value.
ALTER TABLE translations ADD COLUMN sourceHash TEXT;
