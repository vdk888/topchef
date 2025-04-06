#!/bin/bash

# Run database migration
echo "Running schema migration..."
npm run db:push

# Run seed script
echo "Seeding database..."
npx tsx server/seed.ts

echo "Database setup completed"
