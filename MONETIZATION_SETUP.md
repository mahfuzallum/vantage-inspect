# Monetization setup

This update adds admin-editable CPA monetization settings.

Admin -> Settings -> Monetization

Supported ad units:
- Smart Link
- Popunder
- Native Banner
- Social Bar
- Banner
- Custom Body Ad Code

Each code field can be enabled/disabled and tested from the admin panel. Smart Link also has a direct test button and configurable 1/2/3-click session trigger.

Replace the project's existing `src` folder with the included `src` folder. Keep your existing `.env`, database, `node_modules`, `.next`, and other project files unchanged.

Then run:

    npm run build

The ad code fields are stored in the existing `site_settings` table; no new Prisma model or migration is required.
