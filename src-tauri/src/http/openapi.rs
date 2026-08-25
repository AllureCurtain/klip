//! OpenAPI 3.1 specification for the Klip HTTP API.
//!
//! The spec is built from structured Rust data at startup and served at GET /api/openapi.json
//! and GET /openapi.json.
//! Tests in this module verify: (1) spec is valid OpenAPI structure, (2) every route
//! listed in PUBLIC_ROUTES is documented, (3) every $ref points to a defined schema.

/// Build the full OpenAPI 3.1 document.
pub fn build_openapi() -> serde_json::Value {
    // Helper functions.
    fn ref_s(name: &str) -> serde_json::Value {
        serde_json::json!({ "$ref": format!("#/components/schemas/{name}") })
    }
    fn arr(name: &str) -> serde_json::Value {
        serde_json::json!({ "type": "array", "items": ref_s(name) })
    }
    fn ok(schema: serde_json::Value) -> serde_json::Value {
        serde_json::json!({ "description": "OK", "content": { "application/json": { "schema": schema } } })
    }
    fn ok_empty() -> serde_json::Value {
        ok(ref_s("UnitResponse"))
    }
    fn err(code: u16, desc: &str) -> serde_json::Value {
        serde_json::json!({
            "description": format!("{code} - {desc}"),
            "content": { "application/json": { "schema": ref_s("ErrorResponse") } }
        })
    }
    fn qp(name: &str, desc: &str, req: bool, ty: &str) -> serde_json::Value {
        serde_json::json!({
            "name": name, "in": "query", "required": req, "description": desc,
            "schema": { "type": ty }
        })
    }
    fn pp(name: &str, desc: &str) -> serde_json::Value {
        serde_json::json!({
            "name": name, "in": "path", "required": true, "description": desc,
            "schema": { "type": "integer", "format": "int64" }
        })
    }
    fn with_body(op: &mut serde_json::Value, body_ref: &str) {
        op["requestBody"] = serde_json::json!({
            "required": true,
            "content": { "application/json": { "schema": ref_s(body_ref) } }
        });
    }
    fn with_errors(op: &mut serde_json::Value, errors: &[(u16, &str)]) {
        for (code, desc) in errors {
            op["responses"][code.to_string()] = err(*code, desc);
        }
    }
    fn get_op(
        oid: &str,
        summary: &str,
        params: Vec<serde_json::Value>,
        resp: serde_json::Value,
    ) -> serde_json::Value {
        let mut o = serde_json::json!({
            "operationId": oid, "summary": summary, "responses": { "200": resp }
        });
        if !params.is_empty() {
            o["parameters"] = serde_json::Value::Array(params);
        }
        o
    }
    fn post_op(
        oid: &str,
        summary: &str,
        params: Vec<serde_json::Value>,
        body: Option<&str>,
        resp: serde_json::Value,
        errors: &[(u16, &str)],
    ) -> serde_json::Value {
        let mut o = serde_json::json!({
            "operationId": oid, "summary": summary, "responses": { "200": resp }
        });
        if !params.is_empty() {
            o["parameters"] = serde_json::Value::Array(params);
        }
        if let Some(b) = body {
            with_body(&mut o, b);
        }
        with_errors(&mut o, errors);
        o
    }
    fn del_op(
        oid: &str,
        summary: &str,
        params: Vec<serde_json::Value>,
        errors: &[(u16, &str)],
    ) -> serde_json::Value {
        let mut o = serde_json::json!({
            "operationId": oid, "summary": summary, "responses": { "200": ok_empty() }
        });
        if !params.is_empty() {
            o["parameters"] = serde_json::Value::Array(params);
        }
        with_errors(&mut o, errors);
        o
    }

    // Component schemas (manually maintained, mirror Rust structs).
    let s_str = || serde_json::json!({ "type": "string" });
    let s_i64 = || serde_json::json!({ "type": "integer", "format": "int64" });
    let s_bool = || serde_json::json!({ "type": "boolean" });

    fn obj(props: &[(&str, serde_json::Value)], reqs: &[&str]) -> serde_json::Value {
        let mut p = serde_json::Map::new();
        for (k, v) in props {
            p.insert(k.to_string(), v.clone());
        }
        let r: Vec<serde_json::Value> = reqs
            .iter()
            .map(|r| serde_json::Value::String(r.to_string()))
            .collect();
        serde_json::json!({ "type": "object", "properties": p, "required": r })
    }

    let content_type_enum =
        || serde_json::json!({ "type": "string", "enum": ["text","image","file"] });

    let mut schemas = serde_json::Map::new();
    schemas.insert(
        "HealthResponse".into(),
        obj(
            &[("status", s_str()), ("version", s_str())],
            &["status", "version"],
        ),
    );
    schemas.insert(
        "ErrorResponse".into(),
        obj(
            &[("error", s_str()), ("message", s_str())],
            &["error", "message"],
        ),
    );
    schemas.insert(
        "UnitResponse".into(),
        serde_json::json!({
            "type": "null",
            "description": "JSON null returned by endpoints without response data"
        }),
    );
    schemas.insert(
        "OpenApiDocument".into(),
        obj(
            &[
                ("openapi", s_str()),
                ("info", serde_json::json!({ "type": "object" })),
                (
                    "servers",
                    serde_json::json!({ "type": "array", "items": { "type": "object" } }),
                ),
                ("paths", serde_json::json!({ "type": "object" })),
                ("components", serde_json::json!({ "type": "object" })),
            ],
            &["openapi", "info", "paths", "components"],
        ),
    );

    schemas.insert(
        "Tag".into(),
        obj(
            &[
                ("id", s_i64()),
                ("name", s_str()),
                ("color", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("created_at", s_i64()),
            ],
            &["id", "name", "created_at"],
        ),
    );

    schemas.insert("ContentType".into(), content_type_enum());

    schemas.insert(
        "ClipboardFormat".into(),
        obj(
            &[
                (
                    "format",
                    serde_json::json!({ "type": "string", "enum": ["text", "html", "rtf"] }),
                ),
                ("content", s_str()),
            ],
            &["format", "content"],
        ),
    );

    schemas.insert(
        "ClipboardItem".into(),
        obj(
            &[
                ("id", s_i64()),
                ("content_type", ref_s("ContentType")),
                ("content", {
                    let mut v = s_str();
                    // Omitted for image items (use image_ref / the image endpoints).
                    v["nullable"] = true.into();
                    v
                }),
                ("preview", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("hash", s_str()),
                ("size", s_i64()),
                ("metadata", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("source_application", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("source_window_title", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("custom_title", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("note", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("is_favorited", s_bool()),
                ("is_sensitive", s_bool()),
                ("sensitivity_reason", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("formats", arr("ClipboardFormat")),
                ("ocr", {
                    let mut v = ref_s("OcrState");
                    v["nullable"] = true.into();
                    v
                }),
                ("image_ref", {
                    let mut v = ref_s("ImageRef");
                    v["nullable"] = true.into();
                    v
                }),
                ("tags", arr("Tag")),
                ("created_at", s_i64()),
                ("last_used_at", s_i64()),
            ],
            &[
                "id",
                "content_type",
                "hash",
                "size",
                "source_application",
                "source_window_title",
                "custom_title",
                "note",
                "is_favorited",
                "is_sensitive",
                "formats",
                "tags",
                "created_at",
                "last_used_at",
            ],
        ),
    );

    schemas.insert(
        "ImageRef".into(),
        obj(
            &[
                ("url", s_str()),
                ("thumbnail_url", s_str()),
                ("width", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("height", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("size", s_i64()),
            ],
            &["url", "thumbnail_url", "size"],
        ),
    );

    schemas.insert(
        "OcrState".into(),
        obj(
            &[
                (
                    "status",
                    serde_json::json!({"type":"string","enum":["pending","completed","failed"]}),
                ),
                ("text", s_str()),
                ("error", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
                ("updated_at", s_i64()),
            ],
            &["status", "text", "updated_at"],
        ),
    );

    schemas.insert(
        "WindowStatus".into(),
        obj(
            &[
                ("exists", s_bool()),
                ("visible", s_bool()),
                ("minimized", s_bool()),
                ("maximized", s_bool()),
                ("focused", s_bool()),
                ("x", s_i64()),
                ("y", s_i64()),
                ("width", s_i64()),
                ("height", s_i64()),
            ],
            &[
                "exists",
                "visible",
                "minimized",
                "maximized",
                "focused",
                "x",
                "y",
                "width",
                "height",
            ],
        ),
    );

    let health_check_status = serde_json::json!({"type":"string","enum":["ok","degraded","error"]});
    schemas.insert(
        "HealthCheck".into(),
        obj(
            &[
                ("id", s_str()),
                ("label", s_str()),
                ("status", health_check_status.clone()),
                ("summary", s_str()),
                ("details", serde_json::json!({"type":"object"})),
            ],
            &["id", "label", "status", "summary", "details"],
        ),
    );

    schemas.insert(
        "HealthReport".into(),
        obj(
            &[
                ("status", health_check_status),
                ("generated_at", s_i64()),
                ("checks", arr("HealthCheck")),
            ],
            &["status", "generated_at", "checks"],
        ),
    );

    schemas.insert(
        "Snippet".into(),
        obj(
            &[
                ("id", s_i64()),
                ("title", s_str()),
                ("content", s_str()),
                ("tag_id", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("is_favorited", s_bool()),
                ("created_at", s_i64()),
                ("updated_at", s_i64()),
            ],
            &[
                "id",
                "title",
                "content",
                "is_favorited",
                "created_at",
                "updated_at",
            ],
        ),
    );

    schemas.insert(
        "SnippetInput".into(),
        obj(
            &[
                ("title", s_str()),
                ("content", s_str()),
                ("tagId", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("isFavorited", s_bool()),
            ],
            &["title", "content", "isFavorited"],
        ),
    );

    schemas.insert(
        "SourceRule".into(),
        obj(
            &[
                ("id", s_i64()),
                ("match_type", s_str()),
                ("pattern", s_str()),
                ("enabled", s_bool()),
                ("created_at", s_i64()),
                ("updated_at", s_i64()),
            ],
            &[
                "id",
                "match_type",
                "pattern",
                "enabled",
                "created_at",
                "updated_at",
            ],
        ),
    );

    schemas.insert(
        "SourceRuleInput".into(),
        obj(
            &[
                ("matchType", s_str()),
                ("pattern", s_str()),
                ("enabled", s_bool()),
            ],
            &["matchType", "pattern", "enabled"],
        ),
    );

    schemas.insert(
        "AdvancedSearchQuery".into(),
        obj(
            &[
                ("query", s_str()),
                ("contentType", {
                    let mut v = content_type_enum();
                    v["nullable"] = true.into();
                    v
                }),
                ("favoriteOnly", s_bool()),
                ("sensitiveOnly", {
                    let mut v = s_bool();
                    v["nullable"] = true.into();
                    v
                }),
                ("tagId", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("exactMatch", s_bool()),
                ("createdAfter", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("createdBefore", {
                    let mut v = s_i64();
                    v["nullable"] = true.into();
                    v
                }),
                ("limit", s_i64()),
                ("offset", s_i64()),
            ],
            &["query", "favoriteOnly", "exactMatch", "limit", "offset"],
        ),
    );

    schemas.insert(
        "StatsResponse".into(),
        obj(
            &[
                ("total_items", s_i64()),
                ("text_count", s_i64()),
                ("image_count", s_i64()),
                ("file_count", s_i64()),
                ("favorite_count", s_i64()),
                ("sensitive_count", s_i64()),
                ("tag_count", s_i64()),
                ("snippet_count", s_i64()),
                ("source_rule_count", s_i64()),
                ("total_size_bytes", s_i64()),
                ("db_size_bytes", s_i64()),
            ],
            &[
                "total_items",
                "text_count",
                "image_count",
                "file_count",
                "favorite_count",
                "sensitive_count",
                "tag_count",
                "snippet_count",
                "source_rule_count",
                "total_size_bytes",
                "db_size_bytes",
            ],
        ),
    );

    schemas.insert(
        "SystemInfo".into(),
        obj(
            &[
                ("platform", s_str()),
                ("version", s_str()),
                ("app_version", s_str()),
            ],
            &["platform", "version", "app_version"],
        ),
    );

    schemas.insert(
        "DiagnosticsInfo".into(),
        obj(
            &[
                ("platform", s_str()),
                ("app_version", s_str()),
                ("data_dir", s_str()),
                ("db_path", s_str()),
                ("log_dir", s_str()),
            ],
            &["platform", "app_version", "data_dir", "db_path", "log_dir"],
        ),
    );

    schemas.insert(
        "BackupSummary".into(),
        obj(&[("path", s_str()), ("size", s_i64())], &["path", "size"]),
    );

    schemas.insert(
        "ImportSummary".into(),
        obj(
            &[("imported", s_i64()), ("skipped", s_i64())],
            &["imported", "skipped"],
        ),
    );

    schemas.insert(
        "RestoreSummary".into(),
        obj(
            &[
                ("path", s_str()),
                ("size", s_i64()),
                ("pre_restore_backup_path", s_str()),
                ("pre_restore_backup_size", s_i64()),
            ],
            &[
                "path",
                "size",
                "pre_restore_backup_path",
                "pre_restore_backup_size",
            ],
        ),
    );

    schemas.insert(
        "QaContextItem".into(),
        obj(
            &[
                ("id", s_i64()),
                ("preview", s_str()),
                ("score", {
                    serde_json::json!({ "type": "number", "format": "double" })
                }),
            ],
            &["id", "preview", "score"],
        ),
    );

    schemas.insert(
        "QaAnswer".into(),
        obj(
            &[
                ("answer", s_str()),
                ("provider", s_str()),
                ("model", s_str()),
                ("context_count", s_i64()),
                ("context", arr("QaContextItem")),
            ],
            &["answer", "provider", "model", "context_count", "context"],
        ),
    );

    schemas.insert(
        "ConfigEntry".into(),
        obj(
            &[
                ("key", s_str()),
                ("value", s_str()),
                ("updated_at", s_i64()),
            ],
            &["key", "value", "updated_at"],
        ),
    );

    schemas.insert(
        "IdsBody".into(),
        obj(
            &[("ids", {
                serde_json::json!({ "type": "array", "items": s_i64() })
            })],
            &["ids"],
        ),
    );

    schemas.insert(
        "FavoriteBody".into(),
        obj(
            &[
                ("ids", {
                    serde_json::json!({ "type": "array", "items": s_i64() })
                }),
                ("isFavorited", s_bool()),
            ],
            &["ids", "isFavorited"],
        ),
    );

    schemas.insert(
        "TagBody".into(),
        obj(
            &[
                ("name", s_str()),
                ("color", {
                    let mut v = s_str();
                    v["nullable"] = true.into();
                    v
                }),
            ],
            &["name"],
        ),
    );

    schemas.insert(
        "EnabledBody".into(),
        obj(&[("enabled", s_bool())], &["enabled"]),
    );
    schemas.insert("PathBody".into(), obj(&[("path", s_str())], &["path"]));
    schemas.insert("ValueBody".into(), obj(&[("value", s_str())], &["value"]));
    schemas.insert(
        "QaAskBody".into(),
        obj(&[("question", s_str())], &["question"]),
    );
    schemas.insert(
        "CountResponse".into(),
        obj(&[("count", s_i64())], &["count"]),
    );
    schemas.insert(
        "ConfigManyBody".into(),
        serde_json::json!({
            "oneOf": [
                obj(&[
                    ("entries", serde_json::json!({
                        "type": "array",
                        "items": obj(&[("key", s_str()), ("value", s_str())], &["key", "value"])
                    }))
                ], &["entries"]),
                {"type": "object", "additionalProperties": {"type": "string"}}
            ]
        }),
    );

    // Paths.
    let mut paths = serde_json::Map::new();
    macro_rules! route {
        ($p:expr, $($method:ident: $op:expr),+ $(,)?) => {{
            let mut item = serde_json::Map::new();
            $( item.insert(stringify!($method).into(), $op); )+
            paths.insert($p.into(), serde_json::Value::Object(item));
        }};
    }

    route!("/api/health", get: get_op("health","Service health check",vec![],ok(ref_s("HealthResponse"))));
    route!("/api/openapi.json", get: get_op("openapiJson","OpenAPI 3.1 specification",vec![],ok(ref_s("OpenApiDocument"))));
    route!("/openapi.json", get: get_op("openapiJsonRoot","OpenAPI 3.1 specification",vec![],ok(ref_s("OpenApiDocument"))));

    route!("/api/events", get: serde_json::json!({
        "operationId":"events","summary":"Server-Sent Event stream",
        "responses":{"200":{
            "description":"SSE stream (text/event-stream). Events: clipboard-updated, clipboard-cleared, config-changed",
            "content":{"text/event-stream":{"schema":{"type":"string"}}}
        }}
    }));
    route!("/api/stats", get: get_op("stats","Aggregate statistics",vec![],ok(ref_s("StatsResponse"))));

    let lp = vec![
        qp("limit", "Max items (default 100)", false, "integer"),
        qp("offset", "Pagination offset", false, "integer"),
        qp("contentType", "Filter: text|image|file", false, "string"),
        qp("favoriteOnly", "Only favorites", false, "boolean"),
        qp("tagId", "Filter by tag ID", false, "integer"),
    ];
    route!("/api/clipboard",
        get: get_op("listClipboard","List clipboard items",lp.clone(),ok(arr("ClipboardItem"))),
        delete: del_op("clearClipboard","Delete ALL clipboard items",vec![],&[(500,"Database error")])
    );

    let sp = vec![
        qp("q", "Search query", true, "string"),
        qp("limit", "Max results", false, "integer"),
        qp("offset", "Offset", false, "integer"),
        qp("contentType", "Type filter", false, "string"),
        qp("favoriteOnly", "Favorites only", false, "boolean"),
        qp("tagId", "Tag filter", false, "integer"),
    ];
    route!("/api/clipboard/search", get: get_op("searchClipboard","Simple text search",sp,ok(arr("ClipboardItem"))));
    route!("/api/clipboard/search/advanced",
        post: post_op("advancedSearch","Advanced search with structured filters",vec![],
            Some("AdvancedSearchQuery"), ok(arr("ClipboardItem")), &[(400,"Invalid query")])
    );
    route!("/api/clipboard/batch-delete",
        post: post_op("batchDelete","Batch delete items",vec![],Some("IdsBody"),ok(ref_s("CountResponse")),&[])
    );
    route!("/api/clipboard/batch-favorite",
        post: post_op("batchFavorite","Batch set favorite",vec![],Some("FavoriteBody"),ok(ref_s("CountResponse")),&[])
    );
    route!("/api/clipboard/rescan-sensitive",
        post: post_op("rescanSensitive","Rescan for sensitive content",vec![],None,ok(ref_s("CountResponse")),&[])
    );

    let idp = vec![pp("id", "Clipboard item ID")];
    route!("/api/clipboard/{id}",
        get: get_op("getClipboard","Get single item (image content omitted; use image endpoints)",idp.clone(),ok(ref_s("ClipboardItem"))),
        delete: del_op("deleteClipboard","Delete item",idp.clone(),&[(404,"Not found")])
    );
    route!("/api/clipboard/{id}/image",
        get: get_op("getClipboardImage","Full-size image (image/png)",idp.clone(),
            ok(serde_json::json!({"type":"string","format":"binary"})))
    );
    route!("/api/clipboard/{id}/thumbnail",
        get: get_op("getClipboardThumbnail","Thumbnail image (image/png, longest side ≤400px)",idp.clone(),
            ok(serde_json::json!({"type":"string","format":"binary"})))
    );
    route!("/api/clipboard/{id}/ocr",
        get: get_op("getOcr","Get OCR state for an image item",idp.clone(),ok(ref_s("OcrState"))),
        post: post_op("triggerOcr","(Re)run OCR for an image item (requires desktop app)",idp.clone(),None,ok(ref_s("OcrState")),
            &[(400,"Not an image"),(404,"Not found"),(503,"OCR worker unavailable")])
    );
    route!("/api/clipboard/{id}/favorite",
        post: post_op("toggleFavorite","Toggle favorite",idp.clone(),None,ok(ref_s("ClipboardItem")),&[(404,"Not found")])
    );
    route!("/api/clipboard/{id}/copy",
        post: post_op("copyClipboard","Copy to OS clipboard",idp.clone(),None,ok_empty(),
            &[(404,"Not found"),(500,"Clipboard error")])
    );
    route!("/api/clipboard/{id}/paste",
        post: post_op("pasteClipboard","Copy + simulate paste keystroke",idp.clone(),None,ok_empty(),
            &[(404,"Not found"),(500,"Requires Tauri app")])
    );

    let tagp = vec![pp("id", "Clipboard item ID"), pp("tag_id", "Tag ID")];
    route!("/api/clipboard/{id}/tags/{tag_id}",
        post: post_op("assignTag","Assign tag to item",tagp.clone(),None,ok_empty(),&[(404,"Not found")]),
        delete: del_op("removeTag","Remove tag from item",tagp,&[(404,"Not found")])
    );

    route!("/api/tags",
        get: get_op("listTags","List all tags",vec![],ok(arr("Tag"))),
        post: post_op("createTag","Create tag",vec![],Some("TagBody"),ok(ref_s("Tag")),&[(400,"Invalid input")])
    );
    route!("/api/tags/{id}", delete: del_op("deleteTag","Delete tag",vec![pp("id","Tag ID")],&[(404,"Not found")]));

    route!("/api/snippets",
        get: get_op("listSnippets","List snippets",vec![],ok(arr("Snippet"))),
        post: post_op("createSnippet","Create snippet",vec![],Some("SnippetInput"),ok(ref_s("Snippet")),&[])
    );
    route!("/api/snippets/search",
        get: get_op("searchSnippets","Search snippets",vec![qp("q","Search query",false,"string")],ok(arr("Snippet")))
    );
    route!("/api/snippets/{id}",
        put: post_op("updateSnippet","Update snippet",vec![pp("id","Snippet ID")],
            Some("SnippetInput"),ok(ref_s("Snippet")),&[(404,"Not found")]),
        delete: del_op("deleteSnippet","Delete snippet",vec![pp("id","Snippet ID")],&[(404,"Not found")])
    );

    route!("/api/source-rules",
        get: get_op("listSourceRules","List source rules",vec![],ok(arr("SourceRule"))),
        post: post_op("createSourceRule","Create source rule",vec![],Some("SourceRuleInput"),ok(ref_s("SourceRule")),&[])
    );
    route!("/api/source-rules/{id}",
        put: post_op("updateSourceRule","Update source rule",vec![pp("id","Rule ID")],
            Some("SourceRuleInput"),ok(ref_s("SourceRule")),&[]),
        delete: del_op("deleteSourceRule","Delete source rule",vec![pp("id","Rule ID")],&[])
    );
    let enabled_op = post_op(
        "setSourceRuleEnabled",
        "Toggle rule enabled",
        vec![pp("id", "Rule ID")],
        Some("EnabledBody"),
        ok(ref_s("SourceRule")),
        &[],
    );
    let enabled_op2 = post_op(
        "setSourceRuleEnabledPut",
        "Toggle rule enabled (PUT alias)",
        vec![pp("id", "Rule ID")],
        Some("EnabledBody"),
        ok(ref_s("SourceRule")),
        &[],
    );
    route!("/api/source-rules/{id}/enabled", patch: enabled_op, put: enabled_op2);

    let kv_schema = serde_json::json!({"type":"object","additionalProperties":{"type":"string"}});
    let nullable_str = serde_json::json!({"type":["string","null"]});
    route!("/api/config",
        get: get_op("getAllConfig","Get all config",vec![],ok(kv_schema)),
        put: post_op("setConfigMany","Set multiple config values",vec![],Some("ConfigManyBody"),ok_empty(),&[(400,"Invalid input")])
    );
    route!("/api/config/{key}",
        get: get_op("getConfigKey","Get single config value",vec![pp("key","Config key")],ok(nullable_str)),
        put: post_op("setConfigKey","Set single config value",vec![pp("key","Config key")],
            Some("ValueBody"),ok_empty(),&[(400,"Invalid key or value")])
    );

    for (ep, desc) in [
        ("toggle", "Toggle window"),
        ("show", "Show window"),
        ("hide", "Hide window"),
    ] {
        paths.insert(format!("/api/window/{ep}"), serde_json::json!({
            "post": post_op(&format!("window_{ep}"),desc,vec![],None,ok_empty(),&[(500,"Requires Tauri app")])
        }));
    }
    route!("/api/window/status",
        get: get_op("windowStatus","Read-only main-window status (requires desktop app)",vec![],
            ok(ref_s("WindowStatus")))
    );

    route!("/api/autostart",
        get: get_op("getAutostart","Get autostart state",vec![],
            ok(serde_json::json!({"type":"boolean"}))),
        put: post_op("setAutostart","Set autostart",vec![],Some("EnabledBody"),ok_empty(),
            &[(500,"Requires Tauri/OS integration")])
    );
    route!("/api/system/info", get: get_op("systemInfo","System info",vec![],ok(ref_s("SystemInfo"))));
    route!("/api/system/diagnostics", get: get_op("diagnostics","Diagnostics info",vec![],ok(ref_s("DiagnosticsInfo"))));
    route!("/api/diagnostics/health",
        get: get_op("diagnosticsHealth","Run read-only self-checks (SQLite integrity, search-index consistency, data-directory usage)",
            vec![], ok(ref_s("HealthReport")))
    );

    for (ep, desc, resp) in [
        ("export/json", "Export to JSON", "BackupSummary"),
        ("export/csv", "Export to CSV", "BackupSummary"),
        ("import/json", "Import from JSON", "ImportSummary"),
        ("import/csv", "Import from CSV", "ImportSummary"),
        ("backup", "Backup database", "BackupSummary"),
    ] {
        let oid = ep.replace('/', "_");
        paths.insert(
            format!("/api/{ep}"),
            serde_json::json!({
                "post": post_op(&oid, desc, vec![], Some("PathBody"), ok(ref_s(resp)),
                    &[(400,"Invalid path")])
            }),
        );
    }
    route!("/api/restore",
        post: post_op("restore","Restore database from backup",vec![],Some("PathBody"),
            ok(ref_s("RestoreSummary")),&[(400,"Invalid backup file")])
    );

    let qa_op = post_op(
        "qaAsk",
        "Ask QA about clipboard history",
        vec![],
        Some("QaAskBody"),
        ok(ref_s("QaAnswer")),
        &[(400, "Empty question"), (502, "LLM provider error")],
    );
    route!("/api/qa/ask", post: qa_op.clone());
    route!("/api/ask", post: qa_op);

    // SSE stream: `text/event-stream` frames — `context`, then `delta` chunks,
    // then `done` (or `error`). Documented as an event-stream response.
    let qa_stream_op = post_op(
        "qaAskStream",
        "Ask QA about clipboard history (streaming SSE answer)",
        vec![],
        Some("QaAskBody"),
        ok(serde_json::json!({
            "type": "string",
            "format": "text/event-stream",
            "description": "SSE frames: event=context {context_count,items[{id,preview,score}]}, event=delta {text}, event=done {provider,model,context_count}, event=error {error,message}"
        })),
        &[(400, "Empty question"), (502, "LLM provider error")],
    );
    route!("/api/qa/ask/stream", post: qa_stream_op);

    serde_json::json!({
        "openapi": "3.1.0",
        "info": {
            "title": "Klip HTTP API",
            "version": env!("CARGO_PKG_VERSION"),
            "description": "Local HTTP API for Klip clipboard manager. Binds to 127.0.0.1 only.\n\nError format: `{\"error\": \"<code>\", \"message\": \"...\"}`\n\nOptional access token: when `http_access_token` is set in the config, every endpoint (including the SSE stream) requires `Authorization: Bearer <token>` or `?access_token=<token>`; requests without it get 401."
        },
        "servers": [{"url":"http://127.0.0.1:27717","description":"Default local endpoint"}],
        "paths": serde_json::Value::Object(paths),
        "components": {
            "schemas": serde_json::Value::Object(schemas),
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "description": "Present only when http_access_token is configured"
                }
            }
        }
    })
}

pub const PUBLIC_ROUTES: &[(&str, &str)] = &[
    ("GET", "/api/health"),
    ("GET", "/api/openapi.json"),
    ("GET", "/openapi.json"),
    ("GET", "/api/events"),
    ("GET", "/api/stats"),
    ("GET", "/api/clipboard"),
    ("DELETE", "/api/clipboard"),
    ("GET", "/api/clipboard/search"),
    ("POST", "/api/clipboard/search/advanced"),
    ("POST", "/api/clipboard/batch-delete"),
    ("POST", "/api/clipboard/batch-favorite"),
    ("POST", "/api/clipboard/rescan-sensitive"),
    ("GET", "/api/clipboard/{id}"),
    ("DELETE", "/api/clipboard/{id}"),
    ("GET", "/api/clipboard/{id}/image"),
    ("GET", "/api/clipboard/{id}/thumbnail"),
    ("GET", "/api/clipboard/{id}/ocr"),
    ("POST", "/api/clipboard/{id}/ocr"),
    ("POST", "/api/clipboard/{id}/favorite"),
    ("POST", "/api/clipboard/{id}/copy"),
    ("POST", "/api/clipboard/{id}/paste"),
    ("POST", "/api/clipboard/{id}/tags/{tag_id}"),
    ("DELETE", "/api/clipboard/{id}/tags/{tag_id}"),
    ("GET", "/api/tags"),
    ("POST", "/api/tags"),
    ("DELETE", "/api/tags/{id}"),
    ("GET", "/api/snippets"),
    ("POST", "/api/snippets"),
    ("GET", "/api/snippets/search"),
    ("PUT", "/api/snippets/{id}"),
    ("DELETE", "/api/snippets/{id}"),
    ("GET", "/api/source-rules"),
    ("POST", "/api/source-rules"),
    ("PUT", "/api/source-rules/{id}"),
    ("DELETE", "/api/source-rules/{id}"),
    ("PATCH", "/api/source-rules/{id}/enabled"),
    ("PUT", "/api/source-rules/{id}/enabled"),
    ("GET", "/api/config"),
    ("PUT", "/api/config"),
    ("GET", "/api/config/{key}"),
    ("PUT", "/api/config/{key}"),
    ("POST", "/api/window/toggle"),
    ("POST", "/api/window/show"),
    ("POST", "/api/window/hide"),
    ("GET", "/api/window/status"),
    ("GET", "/api/autostart"),
    ("PUT", "/api/autostart"),
    ("GET", "/api/system/info"),
    ("GET", "/api/system/diagnostics"),
    ("GET", "/api/diagnostics/health"),
    ("POST", "/api/export/json"),
    ("POST", "/api/export/csv"),
    ("POST", "/api/import/json"),
    ("POST", "/api/import/csv"),
    ("POST", "/api/backup"),
    ("POST", "/api/restore"),
    ("POST", "/api/qa/ask"),
    ("POST", "/api/ask"),
    ("POST", "/api/qa/ask/stream"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_is_valid_openapi_structure() {
        let s = build_openapi();
        assert_eq!(s["openapi"], "3.1.0");
        assert!(s["info"]["title"].is_string());
        assert!(s["paths"].is_object());
        assert!(s["components"]["schemas"].is_object());
        assert!(s["paths"].as_object().unwrap().len() >= 25);
        assert!(s["components"]["schemas"].as_object().unwrap().len() >= 15);
    }

    #[test]
    fn clipboard_item_schema_exposes_nullable_source_attribution() {
        let spec = build_openapi();
        let schema = &spec["components"]["schemas"]["ClipboardItem"];

        assert_eq!(schema["properties"]["source_application"]["type"], "string");
        assert_eq!(schema["properties"]["source_application"]["nullable"], true);
        assert_eq!(
            schema["properties"]["source_window_title"]["nullable"],
            true
        );
        let required = schema["required"].as_array().unwrap();
        assert!(required.iter().any(|value| value == "source_application"));
        assert!(required.iter().any(|value| value == "source_window_title"));
    }

    #[test]
    fn clipboard_item_schema_exposes_nullable_annotations() {
        let spec = build_openapi();
        let schema = &spec["components"]["schemas"]["ClipboardItem"];

        assert_eq!(schema["properties"]["custom_title"]["type"], "string");
        assert_eq!(schema["properties"]["custom_title"]["nullable"], true);
        assert_eq!(schema["properties"]["note"]["nullable"], true);
        let required = schema["required"].as_array().unwrap();
        assert!(required.iter().any(|value| value == "custom_title"));
        assert!(required.iter().any(|value| value == "note"));
    }

    #[test]
    fn all_public_routes_documented() {
        let s = build_openapi();
        let paths = s["paths"].as_object().unwrap();
        fn normalize(p: &str) -> String {
            let mut r = String::new();
            let mut in_p = false;
            for c in p.chars() {
                match c {
                    ':' => {
                        in_p = true;
                        r.push('{');
                    }
                    '/' if in_p => {
                        r.push('}');
                        r.push('/');
                        in_p = false;
                    }
                    c => r.push(c),
                }
            }
            if in_p {
                r.push('}');
            }
            r
        }
        let mut missing = vec![];
        for (m, route) in PUBLIC_ROUTES {
            let np = normalize(route);
            let Some(pi) = paths.get(&np) else {
                missing.push(format!("{m} {route}"));
                continue;
            };
            if pi.get(m.to_lowercase()).is_none() {
                missing.push(format!("{m} {route}"));
            }
        }
        assert!(
            missing.is_empty(),
            "Undocumented:\n  {}",
            missing.join("\n  ")
        );
    }

    #[test]
    fn all_schema_refs_resolve() {
        let s = build_openapi();
        let schemas = s["components"]["schemas"].as_object().unwrap();
        for (path, methods) in s["paths"].as_object().unwrap() {
            for (method, op) in methods.as_object().unwrap() {
                for code in ["200", "400", "404", "500", "502"] {
                    if let Some(schema_ref) =
                        op["responses"][code]["content"]["application/json"]["schema"].get("$ref")
                    {
                        let name = schema_ref.as_str().unwrap().rsplit('/').next().unwrap();
                        assert!(
                            schemas.contains_key(name),
                            "broken $ref '{name}' in {method} {path}"
                        );
                    }
                }
                if let Some(schema_ref) =
                    op["requestBody"]["content"]["application/json"]["schema"].get("$ref")
                {
                    let name = schema_ref.as_str().unwrap().rsplit('/').next().unwrap();
                    assert!(
                        schemas.contains_key(name),
                        "broken body $ref '{name}' in {method} {path}"
                    );
                }
            }
        }
    }

    #[test]
    fn every_declared_response_content_has_schema() {
        let s = build_openapi();
        let mut missing = Vec::new();
        for (path, methods) in s["paths"].as_object().unwrap() {
            for (method, op) in methods.as_object().unwrap() {
                for (code, response) in op["responses"].as_object().unwrap() {
                    let Some(content) = response.get("content") else {
                        continue;
                    };
                    for (media_type, media) in content.as_object().unwrap() {
                        if media.get("schema").is_none() {
                            missing.push(format!("{method} {path} {code} {media_type}"));
                        }
                    }
                }
            }
        }
        assert!(
            missing.is_empty(),
            "responses without schemas:\n{}",
            missing.join("\n")
        );
    }

    #[test]
    fn print_spec_counts() {
        let s = build_openapi();
        let pc = s["paths"].as_object().unwrap().len();
        let sc = s["components"]["schemas"].as_object().unwrap().len();
        println!("OPENAPI_PATHS={pc} OPENAPI_SCHEMAS={sc}");
        assert!(pc >= 25);
        assert!(sc >= 15);
    }
}
