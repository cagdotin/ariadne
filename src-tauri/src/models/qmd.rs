use serde::Serialize;

#[derive(Serialize)]
pub struct QmdAvailability {
    pub installed: bool,
    pub version: Option<String>,
    pub db_path: Option<String>,
    pub db_size_bytes: Option<u64>,
}

#[derive(Serialize)]
pub struct QmdStatus {
    pub total_documents: u32,
    pub active_documents: u32,
    pub embedded_chunks: u32,
    pub needs_embedding: u32,
    pub collection_count: u32,
    pub db_size_bytes: u64,
    pub global_context: Option<String>,
    pub days_since_update: Option<u32>,
}

#[derive(Serialize)]
pub struct QmdContext {
    pub path: String,
    pub context: String,
}

#[derive(Serialize)]
pub struct QmdCollection {
    pub name: String,
    pub path: String,
    pub pattern: String,
    pub ignore_patterns: Vec<String>,
    pub include_by_default: bool,
    pub update_command: Option<String>,
    pub doc_count: u32,
    pub active_doc_count: u32,
    pub embedded_count: u32,
    pub last_modified: Option<String>,
    pub contexts: Vec<QmdContext>,
}

#[derive(Serialize)]
pub struct QmdDocument {
    pub path: String,
    pub title: String,
    pub docid: String,
    pub collection: String,
    pub modified_at: String,
    pub body_length: u32,
}

#[derive(Serialize)]
pub struct QmdCollectionDetail {
    pub collection: QmdCollection,
    pub documents: Vec<QmdDocument>,
}

#[derive(Serialize)]
pub struct QmdCommandResult {
    pub success: bool,
    pub output: String,
}
