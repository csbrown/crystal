import type { Preset } from "graphile-plugin";

import { PgAllRowsPlugin } from "./plugins/PgAllRowsPlugin";
import { PgColumnsPlugin } from "./plugins/PgColumnsPlugin";
import { PgIntrospectionPlugin } from "./plugins/PgIntrospectionPlugin";
import { PgTablesPlugin } from "./plugins/PgTablesPlugin";

export const defaultPreset: Preset = {
  plugins: [
    PgIntrospectionPlugin,
    PgTablesPlugin,
    PgColumnsPlugin,
    PgAllRowsPlugin,
  ],
};
