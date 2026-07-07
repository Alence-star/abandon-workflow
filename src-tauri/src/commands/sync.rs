use tauri::State;

use crate::{account_sync, commands::config, AppState};

#[tauri::command]
pub async fn sync_now(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let Some(user_id) =
        config::get_current_user_id(db.conn()).map_err(|e| format!("读取登录状态失败: {}", e))?
    else {
        return Err("请先登录账号，再执行同步。".into());
    };

    let Some(username) = account_sync::lookup_username(db.conn(), user_id)? else {
        return Err("当前登录账号不存在。".into());
    };

    let pulled = account_sync::pull_user_snapshot(db.conn(), user_id, &username)?;
    let pushed = account_sync::push_user_snapshot(db.conn(), user_id, &username)?;

    let message = if pulled {
        "已从共享目录拉取并刷新当前账号数据。"
    } else if pushed {
        "已将当前账号数据写入共享目录。"
    } else {
        "未配置共享同步目录。"
    };

    Ok(message.to_string())
}
