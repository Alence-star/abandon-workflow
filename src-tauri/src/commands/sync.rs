use tauri::State;

use crate::{account_sync, commands::config, AppState};

#[tauri::command]
pub async fn sync_now(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let Some(user_id) = config::get_current_user_id(db.conn())
        .map_err(|error| format!("读取登录状态失败: {}", error))?
    else {
        return Err("请先登录账号，再执行同步。".into());
    };

    let Some(username) = account_sync::lookup_username(db.conn(), user_id)? else {
        return Err("当前登录账号不存在。".into());
    };

    let pulled = account_sync::pull_user_snapshot(db.conn(), user_id, &username)?;
    let pushed = account_sync::push_user_snapshot(db.conn(), user_id, &username)?;

    let message = if pulled && pushed {
        "已从同步后端拉取并刷新当前账号数据。"
    } else if pulled {
        "已从同步后端拉取当前账号数据。"
    } else if pushed {
        "已将当前账号数据写入同步后端。"
    } else {
        "未配置共享目录或 GitHub 云同步令牌。"
    };

    Ok(message.to_string())
}
