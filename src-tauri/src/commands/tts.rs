use std::process::{Child, Command, Stdio};

use tauri::State;

use crate::SpeechState;

fn escape_powershell_single_quotes(value: &str) -> String {
    value.replace('\'', "''")
}

fn xml_escape_char(ch: char, buffer: &mut String) {
    match ch {
        '&' => buffer.push_str("&amp;"),
        '<' => buffer.push_str("&lt;"),
        '>' => buffer.push_str("&gt;"),
        '"' => buffer.push_str("&quot;"),
        '\'' => buffer.push_str("&apos;"),
        _ => buffer.push(ch),
    }
}

fn build_expressive_ssml(text: &str) -> String {
    let mut body = String::new();
    let mut pending_space = false;
    let mut newline_count = 0usize;

    for ch in text.chars() {
        if ch == '\r' {
            continue;
        }

        if ch == '\n' {
            newline_count += 1;
            pending_space = false;
            continue;
        }

        if ch.is_whitespace() {
            pending_space = true;
            continue;
        }

        if newline_count > 0 {
            if newline_count >= 2 {
                body.push_str(r#"<break time="900ms"/>"#);
            } else {
                body.push_str(r#"<break time="500ms"/>"#);
            }
            newline_count = 0;
        } else if pending_space && !body.is_empty() {
            body.push(' ');
        }
        pending_space = false;

        match ch {
            ',' => {
                body.push(',');
                body.push_str(r#"<break time="220ms"/>"#);
            }
            ';' => {
                body.push(';');
                body.push_str(r#"<break time="360ms"/>"#);
            }
            ':' => {
                body.push(':');
                body.push_str(r#"<break time="420ms"/>"#);
            }
            '.' => {
                body.push('.');
                body.push_str(r#"<break time="650ms"/>"#);
            }
            '!' => {
                body.push('!');
                body.push_str(r#"<break time="720ms"/>"#);
            }
            '?' => {
                body.push('?');
                body.push_str(r#"<break time="760ms"/>"#);
            }
            '\u{2014}' => {
                body.push_str(r#"<break time="260ms"/>"#);
            }
            _ => xml_escape_char(ch, &mut body),
        }
    }

    if newline_count > 0 {
        if newline_count >= 2 {
            body.push_str(r#"<break time="900ms"/>"#);
        } else {
            body.push_str(r#"<break time="500ms"/>"#);
        }
    }

    format!(
        r#"<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis"><prosody rate="-8%" pitch="+3%">{}</prosody></speak>"#,
        body
    )
}

fn stop_child_process(child: &mut Child) {
    if let Ok(Some(_)) = child.try_wait() {
        return;
    }

    let _ = child.kill();
    let _ = child.wait();
}

fn start_tracked_speech<F>(state: &SpeechState, spawn_child: F) -> Result<(), String>
where
    F: FnOnce() -> Result<Child, String>,
{
    let mut guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = guard.take() {
        stop_child_process(&mut child);
    }

    let child = spawn_child()?;
    *guard = Some(child);
    Ok(())
}

fn stop_tracked_speech(state: &SpeechState) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = guard.take() {
        stop_child_process(&mut child);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn spawn_macos_speech(content: &str, voice: &str, rate: &str) -> Result<Child, String> {
    Command::new("say")
        .arg(content)
        .args(["--voice", voice])
        .args(["--rate", rate])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to speak: {}", e))
}

#[cfg(target_os = "windows")]
fn select_voice_script(prefer_british: bool) -> String {
    if prefer_british {
        r#"
$voices = $speak.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$voice = $voices |
  Sort-Object `
    @{ Expression = { if ($_.Culture.Name -like 'en-GB*') { 0 } elseif ($_.Culture.Name -like 'en-*') { 1 } else { 9 } } }, `
    @{ Expression = { if ($_.Gender -eq 'Female') { 0 } else { 1 } } } |
  Select-Object -First 1
if ($voice) { $speak.SelectVoice($voice.Name) }
"#
        .to_string()
    } else {
        r#"
$voices = $speak.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$voice = $voices |
  Sort-Object `
    @{ Expression = { if ($_.Culture.Name -like 'en-US*') { 0 } elseif ($_.Culture.Name -like 'en-*') { 1 } else { 9 } } }, `
    @{ Expression = { if ($_.Gender -eq 'Female') { 0 } else { 1 } } } |
  Select-Object -First 1
if ($voice) { $speak.SelectVoice($voice.Name) }
"#
        .to_string()
    }
}

#[cfg(target_os = "windows")]
fn spawn_windows_speech(
    content: &str,
    expressive: bool,
    prefer_british: bool,
) -> Result<Child, String> {
    let voice_selection = select_voice_script(prefer_british);
    let escaped_text = escape_powershell_single_quotes(content);

    let script = if expressive {
        let ssml = build_expressive_ssml(content);
        let escaped_ssml = escape_powershell_single_quotes(&ssml);
        format!(
            r#"
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
{}
$speak.Volume = 100
$ssml = @'
{}
'@
$speak.SpeakSsml($ssml)
"#,
            voice_selection, escaped_ssml
        )
    } else {
        format!(
            r#"
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
{}
$speak.Volume = 100
$speak.Speak('{}')
"#,
            voice_selection, escaped_text
        )
    };

    Command::new("powershell")
        .args([
            "-NoProfile",
            "-STA",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to speak: {}", e))
}

#[tauri::command]
pub async fn stop_speech(state: State<'_, SpeechState>) -> Result<(), String> {
    stop_tracked_speech(&state)
}

#[tauri::command]
pub async fn speak_text(
    text: String,
    expressive: Option<bool>,
    state: State<'_, SpeechState>,
) -> Result<(), String> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let rate = if expressive.unwrap_or(false) { "165" } else { "175" };
        return start_tracked_speech(&state, || spawn_macos_speech(&trimmed, "Samantha", rate));
    }

    #[cfg(target_os = "windows")]
    {
        return start_tracked_speech(&state, || {
            spawn_windows_speech(&trimmed, expressive.unwrap_or(false), false)
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (trimmed, expressive, state);
        Err("TTS not supported on this platform".into())
    }
}

#[tauri::command]
pub async fn play_british_pronunciation(
    word: String,
    state: State<'_, SpeechState>,
) -> Result<(), String> {
    let trimmed = word.trim().to_string();
    if trimmed.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        return start_tracked_speech(&state, || spawn_macos_speech(&trimmed, "Daniel", "165"));
    }

    #[cfg(target_os = "windows")]
    {
        return start_tracked_speech(&state, || {
            spawn_windows_speech(&trimmed, false, true)
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (trimmed, state);
        Err("Audio playback not supported on this platform".into())
    }
}
