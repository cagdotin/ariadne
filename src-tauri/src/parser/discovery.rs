use std::path::PathBuf;
use std::fs;
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct SessionFile {
    pub path: PathBuf,
    pub dir_name: String,
    pub file_name: String,
    pub file_size: u64,
}

pub fn discover_session_files() -> Result<Vec<SessionFile>, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let sessions_dir = home_dir.join(".pi").join("agent").join("sessions");
    
    if !sessions_dir.exists() {
        return Ok(Vec::new());
    }

    let mut session_files = Vec::new();

    // Walk each subdirectory in the sessions directory
    for entry in fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))? 
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        
        if !path.is_dir() {
            continue;
        }

        let dir_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Walk all .jsonl files in this project directory
        for file_entry in WalkDir::new(&path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let file_path = file_entry.path();
            
            if let Some(extension) = file_path.extension() {
                if extension == "jsonl" {
                    let file_name = file_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    let file_size = file_entry
                        .metadata()
                        .map(|m| m.len())
                        .unwrap_or(0);

                    session_files.push(SessionFile {
                        path: file_path.to_path_buf(),
                        dir_name: dir_name.clone(),
                        file_name,
                        file_size,
                    });
                }
            }
        }
    }

    // Sort by file name for consistent ordering
    session_files.sort_by(|a, b| a.file_name.cmp(&b.file_name));

    Ok(session_files)
}