# HTTP Route Audit

This audit tracks the public HTTP API exposed by `src-tauri/src/http/mod.rs`, the OpenAPI coverage in `src-tauri/src/http/openapi.rs`, dashboard coverage in `web-klip/`, and test coverage on `main`.

Last updated: 2026-08-06 (routes verified against `http/mod.rs:154-214`)

## Coverage Matrix

| Method | Path | Handler | OpenAPI | Dashboard | Verification |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | `health` | Yes | Status/API settings | `http::tests::health_endpoint_reports_ok` |
| GET | `/openapi.json` | `openapi_json_handler` | Yes | API Spec page via `api.getOpenApiSpec` | `http::tests::openapi_endpoints_serve_documented_api_spec` |
| GET | `/api/openapi.json` | `openapi_json_handler` | Yes | Compatible endpoint shown on API Spec page | `http::tests::openapi_endpoints_serve_documented_api_spec` |
| GET | `/api/events` | `sse_events` | Yes | Events view and status bar | Event names verified by `server_event_names_match_browser_eventsource_contract`; live stream not run |
| GET | `/api/stats` | `get_stats` | Yes | Stats view | `stats_endpoint_reports_database_counts` |
| GET | `/api/clipboard` | `list_clipboard` | Yes | Clipboard view | API client tests; live script available |
| DELETE | `/api/clipboard` | `clear_clipboard` | Yes | System view | API client tests; live script available |
| GET | `/api/clipboard/search` | `search_clipboard` | Yes | Store search and API client | API client tests; live script available |
| POST | `/api/clipboard/search/advanced` | `advanced_search` | Yes | Search view | API client tests; live script available |
| POST | `/api/clipboard/batch-delete` | `batch_delete` | Yes | API client entry | API client tests; live script available |
| POST | `/api/clipboard/batch-favorite` | `batch_favorite` | Yes | API client entry | API client tests; live script available |
| POST | `/api/clipboard/rescan-sensitive` | `rescan_sensitive` | Yes | System view | API client tests; live script available |
| GET | `/api/clipboard/{id}` | `get_clipboard` | Yes | Clipboard detail | API client tests; live script available |
| DELETE | `/api/clipboard/{id}` | `delete_clipboard` | Yes | Clipboard view | API client tests; live script available |
| POST | `/api/clipboard/{id}/favorite` | `toggle_favorite` | Yes | Clipboard view | API client tests; live script available |
| POST | `/api/clipboard/{id}/copy` | `copy_clipboard` | Yes | Clipboard view | API client tests; live script marks OS clipboard failures as skip |
| POST | `/api/clipboard/{id}/paste` | `paste_clipboard` | Yes | API client entry | API client tests; live script skips when Tauri app is required |
| POST | `/api/clipboard/{id}/tags/{tag_id}` | `assign_tag` | Yes | API client entry | API client tests; live script available |
| DELETE | `/api/clipboard/{id}/tags/{tag_id}` | `remove_tag` | Yes | API client entry | API client tests; live script available |
| GET | `/api/tags` | `list_tags` | Yes | Tags view and filters | API client tests; live script available |
| POST | `/api/tags` | `create_tag` | Yes | Tags view | API client tests; live script available |
| DELETE | `/api/tags/{id}` | `delete_tag` | Yes | Tags view | API client tests; live script available |
| GET | `/api/snippets` | `list_snippets` | Yes | Snippets view | API client tests; live script available |
| POST | `/api/snippets` | `create_snippet` | Yes | Snippets view | API client tests; live script available |
| GET | `/api/snippets/search` | `search_snippets` | Yes | API client entry | API client tests; live script available |
| PUT | `/api/snippets/{id}` | `update_snippet` | Yes | Snippets view | API client tests; live script available |
| DELETE | `/api/snippets/{id}` | `delete_snippet` | Yes | Snippets view | API client tests; live script available |
| GET | `/api/source-rules` | `list_source_rules` | Yes | Rules view | API client tests; live script available |
| POST | `/api/source-rules` | `create_source_rule` | Yes | Rules view | API client tests; live script available |
| PUT | `/api/source-rules/{id}` | `update_source_rule` | Yes | Rules view | API client tests; live script available |
| DELETE | `/api/source-rules/{id}` | `delete_source_rule` | Yes | Rules view | API client tests; live script available |
| PATCH | `/api/source-rules/{id}/enabled` | `set_source_rule_enabled` | Yes | Rules view | API client tests; live script available |
| PUT | `/api/source-rules/{id}/enabled` | `set_source_rule_enabled` | Yes | Alias documented | OpenAPI route coverage test |
| GET | `/api/config` | `get_all_config` | Yes | Config view | API client tests; live script available |
| PUT | `/api/config` | `set_config_many` | Yes | Config view | API client tests; live script available |
| GET | `/api/config/{key}` | `get_config` | Yes | API client entry | API client tests; live script available |
| PUT | `/api/config/{key}` | `set_config` | Yes | API client entry | API client tests; live script available |
| POST | `/api/window/toggle` | `toggle_window` | Yes | System view | API client tests; live script skips when Tauri app is required |
| POST | `/api/window/show` | `show_window` | Yes | API client entry | API client tests; live script skips when Tauri app is required |
| POST | `/api/window/hide` | `hide_window` | Yes | API client entry | API client tests; live script skips when Tauri app is required |
| GET | `/api/autostart` | `get_autostart` | Yes | System view | API client tests; live script skips when OS integration is unavailable |
| PUT | `/api/autostart` | `set_autostart` | Yes | API client entry | API client tests; live script skips when OS integration is unavailable |
| GET | `/api/system/info` | `system_info` | Yes | System view | API client tests; live script available |
| GET | `/api/system/diagnostics` | `diagnostics_info` | Yes | System view | API client tests; live script available |
| POST | `/api/export/json` | `export_json` | Yes | System view | API client tests; live script attempts temp path |
| POST | `/api/export/csv` | `export_csv` | Yes | System view | API client tests; live script attempts temp path |
| POST | `/api/import/json` | `import_json` | Yes | System view | API client tests; live script has semi-automatic coverage |
| POST | `/api/import/csv` | `import_csv` | Yes | System view | API client tests; live script has semi-automatic coverage |
| POST | `/api/backup` | `backup_database` | Yes | System view | API client tests; live script attempts temp path |
| POST | `/api/restore` | `restore_database` | Yes | System view | API client tests; live script skips destructive restore |
| POST | `/api/qa/ask` | `qa_ask` | Yes | QA view | `qa_endpoint_uses_fake_provider_and_hides_prompt`; API client tests |
| POST | `/api/ask` | `qa_ask` | Yes | Alias documented | OpenAPI route coverage test |

## Automated Guards

- `http::openapi::tests::all_public_routes_documented` checks every route/method in `PUBLIC_ROUTES`.
- `http::openapi::tests::all_schema_refs_resolve` checks OpenAPI `$ref` targets.
- `http::openapi::tests::every_declared_response_content_has_schema` prevents response content entries without schemas.
- `web-klip/src/lib/api.test.ts` covers every API client method and verifies camelCase request bodies for snippets/source rules.
