using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Text;
using System.Management;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Naumi.Desktop;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var root = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", ".."));
        Application.Run(new MainWindow(root));
    }
}

internal sealed class MainWindow : Form
{
    readonly string root;
    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.White };
    readonly Panel egoSeat = new() { BackColor = Color.White, Visible = false };
    readonly Label notice = new() { Text = "正在启动 Naumi…", AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter };
    Process? egoProcess;
    nint egoWindow;
    nint oldParent;
    long oldStyle, oldExStyle;
    string origin = "";
    readonly System.Windows.Forms.Timer resizeTimer = new() { Interval = 16 };
    Rectangle? requestedBounds;
    bool closing;
    int viewGeneration;
    DateTime lastReceipt;
    long layoutUpdates;
    Padding crop;
    Rectangle lastScreenBounds;
    string activeSeat="";

    public MainWindow(string root)
    {
        this.root = root;
        Text = "Naumi"; Width = 1560; Height = 960; MinimumSize = new Size(900, 640); StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White; Controls.Add(web); Controls.Add(notice); Controls.Add(egoSeat);
        resizeTimer.Tick += (_, _) => { if(egoSeat.Visible && (egoWindow==0||!Native.IsWindow(egoWindow)||Native.GetWindowLongPtr(egoWindow,-8)!=Handle)){HideEgo();WriteReceipt("detached-hidden");return;}ApplyBounds(); };
        Shown += async (_, _) => { try { await Initialize(); } catch (Exception e) { notice.Visible = true; notice.BringToFront(); notice.Text = "启动失败：" + e.Message; WriteReceipt("error", e.GetType().Name + ": " + e.Message); } };
        FormClosing += (_, _) => { closing = true; resizeTimer.Stop(); RestoreEgo(); };
        FormClosed += (_, _) => { resizeTimer.Dispose(); web.Dispose(); egoProcess?.Dispose(); };
    }

    async Task Initialize()
    {
        string ReadLog(string name) { using var stream=new FileStream(Path.Combine(root,"logs",name),FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);using var reader=new StreamReader(stream);return reader.ReadToEnd(); }
        var logs = ReadLog("server.out.log") + ReadLog("server.err.log");
        var matches = Regex.Matches(logs, @"http://127\.0\.0\.1:3080/\?token=[A-Za-z0-9_~.%-]+");
        if (matches.Count == 0) throw new InvalidOperationException("请先启动 Naumi 本地服务");
        var launch = matches[^1].Value; origin = new Uri(launch).GetLeftPart(UriPartial.Authority);
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(root, ".dsh/desktop-shell-profile"));
        await web.EnsureCoreWebView2Async(environment);
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        web.CoreWebView2.NewWindowRequested += (_, e) => { e.Handled = true; };
        web.CoreWebView2.NavigationStarting += (_, e) => { if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.GetLeftPart(UriPartial.Authority) != origin) e.Cancel = true; };
        await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("if(location.origin==='" + origin + "'){Object.defineProperty(window,'__NAUMI_NATIVE_BROWSER__',{value:Object.freeze({version:1,serverName:'naumi-native'}),writable:false});}");
        web.CoreWebView2.WebMessageReceived += ReceiveMessage;
        web.CoreWebView2.Navigate(launch);
        notice.Visible = false;
        resizeTimer.Start();
        WriteReceipt("ready");
    }

    async void ReceiveMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (closing || !Uri.TryCreate(e.Source, UriKind.Absolute, out var source) || source.GetLeftPart(UriPartial.Authority) != origin) return;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson); var message = document.RootElement;
            if (!message.TryGetProperty("channel", out var c) || c.GetString() != "naumi-native-browser-v1") return;
            var seatKey=message.GetProperty("seatKey").GetString();if(string.IsNullOrEmpty(seatKey)||seatKey.Length>300)return;
            var action = message.GetProperty("action").GetString();
            if (action == "hide") { if(activeSeat!=seatKey)return;viewGeneration++; HideEgo();activeSeat=""; return; }
            if (action != "bounds") return;
            activeSeat=seatKey;
            double Read(string key) { var n = message.GetProperty(key).GetDouble(); if (!double.IsFinite(n) || Math.Abs(n) > 16000) throw new InvalidDataException("Invalid bounds"); return n; }
            var scale = web.ZoomFactor * DeviceDpi / 96.0;
            var rect = new Rectangle((int)Math.Round(Read("x") * scale), (int)Math.Round(Read("y") * scale), (int)Math.Round(Read("width") * scale), (int)Math.Round(Read("height") * scale));
            rect.Intersect(web.ClientRectangle);
            if (rect.Width < 100 || rect.Height < 100) { HideEgo(); return; }
            var generation=++viewGeneration;
            await EnsureEgo();if(closing||generation!=viewGeneration)return;requestedBounds = rect;
            if(egoWindow==0||!Native.IsWindow(egoWindow)||Native.GetWindowLongPtr(egoWindow,-8)!=Handle){HideEgo();return;}
            if(egoSeat.Bounds!=rect)egoSeat.Bounds=rect;
            if(!egoSeat.Visible){egoSeat.Visible = true; egoSeat.BringToFront();lastScreenBounds=Rectangle.Empty;}
            web.CoreWebView2.PostWebMessageAsJson("{\"channel\":\"naumi-native-browser-v1\",\"status\":\"attached\"}");
        }
        catch (Exception error)
        {
            HideEgo();
            WriteReceipt("attach-error", error.GetType().Name + ": " + error.Message);
            web.CoreWebView2.PostWebMessageAsJson("{\"channel\":\"naumi-native-browser-v1\",\"status\":\"error\",\"error\":\"NATIVE_BROWSER_ATTACH_FAILED\"}");
        }
    }

    Task? launching;
    async Task EnsureEgo()
    {
        if(egoWindow!=0&&Native.IsWindow(egoWindow)&&Native.GetWindowLongPtr(egoWindow,-8)==Handle)return;
        if(launching is not null){await launching;return;}
        try{launching=LaunchEgo();await launching;}finally{launching=null;}
    }

    async Task LaunchEgo()
    {
        var app = Path.GetFullPath(Path.Combine(root, "runtime/ego-lite/win32-x64/Application/ego.exe"));
        if (!File.Exists(app)) throw new FileNotFoundException("ego 本体未安装");
        var info = new ProcessStartInfo(app) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(app)!, WindowStyle = ProcessWindowStyle.Normal };
        info.ArgumentList.Add("--user-data-dir=" + Path.Combine(root, ".dsh/native-ego-profile"));
        info.ArgumentList.Add("--ego-server-name=naumi-native");
        info.ArgumentList.Add("--no-default-browser-check");
        info.ArgumentList.Add("--new-window");
        info.ArgumentList.Add("about:blank");
        using var search=new ManagementObjectSearcher("SELECT ProcessId,CommandLine,ExecutablePath FROM Win32_Process WHERE Name='ego.exe'");
        var candidates=new List<int>();
        foreach(ManagementObject row in search.Get())
        {
            var command=row["CommandLine"] as string ?? "";
            if(string.Equals(row["ExecutablePath"] as string,app,StringComparison.OrdinalIgnoreCase) && command.Contains("--ego-server-name=naumi-native") && command.Contains(Path.Combine(root,".dsh/native-ego-profile"),StringComparison.OrdinalIgnoreCase))candidates.Add(Convert.ToInt32(row["ProcessId"]));
        }
        if(candidates.Count>1)throw new InvalidOperationException("存在多个专用ego实例，请保留一个");
        egoProcess = candidates.Count==1 ? Process.GetProcessById(candidates[0]) : Process.Start(info) ?? throw new InvalidOperationException("ego 启动失败");
        var deadline = DateTime.UtcNow.AddSeconds(25);
        while (DateTime.UtcNow < deadline && !closing)
        {
            var found = Native.FindWindowForProcess(egoProcess.Id);
            if (found != 0) { await Task.Delay(300);if(Native.FindWindowForProcess(egoProcess.Id)==found){Attach(found); return;} }
            if (egoProcess.HasExited) throw new InvalidOperationException("专用 ego 进程提前退出；未接管其他窗口");
            await Task.Delay(100);
        }
        throw new TimeoutException("ego 窗口启动超时");
    }

    void Attach(nint window)
    {
        egoWindow = window; oldParent = Native.GetWindowLongPtr(window,-8);
        oldStyle = Native.GetWindowLongPtr(window, -16).ToInt64(); oldExStyle = Native.GetWindowLongPtr(window, -20).ToInt64();
        Native.GetWindowRect(window,out var wr);
        if(Native.DwmGetWindowAttribute(window,9,out var visible,Marshal.SizeOf<Native.RECT>())==0)
            crop=new Padding(Math.Clamp(visible.Left-wr.Left,0,24),Math.Clamp(visible.Top-wr.Top,0,24),Math.Clamp(wr.Right-visible.Right,0,24),Math.Clamp(wr.Bottom-visible.Bottom,0,24));
        if(crop.Horizontal==0&&crop.Vertical==0){int border=Native.GetSystemMetricsForDpi(32,(uint)DeviceDpi)+Native.GetSystemMetricsForDpi(92,(uint)DeviceDpi);crop=new Padding(border,0,border,border);}
        Native.ShowWindow(window, 0);
        // Keep ego a native top-level window: its own message queue owns mouse capture, IME and focus.
        // Owned-window docking is deliberately not cross-process SetParent/WS_CHILD reparenting.
        Native.SetWindowLongPtr(window,-8,Handle);
        if (Native.GetWindowLongPtr(window,-8) != Handle) { RestoreEgo(); throw new InvalidOperationException("Windows 原生窗口托管失败"); }
        int corner=1;Native.DwmSetWindowAttribute(window,33,ref corner,4);
        WriteReceipt("attached");
    }

    void ApplyBounds()
    {
        if(closing||!egoSeat.Visible||egoWindow==0||!Native.IsWindow(egoWindow))return;
        if(requestedBounds is Rectangle rect){requestedBounds=null;if(egoSeat.Bounds!=rect)egoSeat.Bounds=rect;}
        var screen=egoSeat.RectangleToScreen(egoSeat.ClientRectangle);
        if(screen==lastScreenBounds)return;lastScreenBounds=screen;
        Native.SetWindowPos(egoWindow,0,screen.X-crop.Left,screen.Y-crop.Top,screen.Width+crop.Horizontal,screen.Height+crop.Vertical,0x0010|0x0004);
        var region=Native.CreateRectRgn(crop.Left,crop.Top,crop.Left+screen.Width,crop.Top+screen.Height);
        if(Native.SetWindowRgn(egoWindow,region,true)==0)Native.DeleteObject(region);
        Native.ShowWindow(egoWindow,4);
        layoutUpdates++;
        if(DateTime.UtcNow-lastReceipt>TimeSpan.FromMilliseconds(500))WriteReceipt("layout");
    }

    void RestoreEgo()
    {
        if (egoWindow == 0 || !Native.IsWindow(egoWindow)) return;
        Native.ShowWindow(egoWindow, 0);Native.SetWindowRgn(egoWindow,0,true); Native.SetWindowLongPtr(egoWindow,-8,oldParent);
        Native.SetWindowLongPtr(egoWindow, -16, (nint)oldStyle); Native.SetWindowLongPtr(egoWindow, -20, (nint)oldExStyle);
        Native.SetWindowPos(egoWindow, 0, 80, 80, 1100, 800, 0x0020 | 0x0010 | 0x0004);
        Native.ShowWindow(egoWindow, 5); WriteReceipt("detached"); egoWindow = 0;
    }

    void HideEgo(){requestedBounds=null;egoSeat.Visible=false;lastScreenBounds=Rectangle.Empty;if(egoWindow!=0&&Native.IsWindow(egoWindow))Native.ShowWindow(egoWindow,0);}

    void WriteReceipt(string status, string? error = null)
    {
        var directory = Path.Combine(root, ".dsh/native-browser"); Directory.CreateDirectory(directory);
        lastReceipt=DateTime.UtcNow;
        File.WriteAllText(Path.Combine(directory, "host-state.json"), JsonSerializer.Serialize(new { status, error, hostPid = Environment.ProcessId, egoPid = egoProcess?.Id, hostHwnd = Handle.ToInt64(), egoHwnd = egoWindow.ToInt64(), ownerHwnd = egoWindow == 0 ? 0 : Native.GetWindowLongPtr(egoWindow,-8).ToInt64(), seatHwnd = egoSeat.Handle.ToInt64(), width = egoSeat.Width, height = egoSeat.Height, dpi = DeviceDpi,layoutUpdates,crop=new{crop.Left,crop.Top,crop.Right,crop.Bottom}, mode="owned-native-window",native = true, screenshotTransport = false }));
    }
}

internal static class Native
{
    [StructLayout(LayoutKind.Sequential)] public struct RECT{public int Left,Top,Right,Bottom;}
    public delegate bool EnumProc(nint hwnd, nint param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, nint param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(nint hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(nint hwnd, StringBuilder text, int size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(nint hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindow(nint hwnd);
    [DllImport("user32.dll")] public static extern nint GetParent(nint hwnd);
    [DllImport("user32.dll", SetLastError = true)] public static extern nint SetParent(nint child, nint parent);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern nint GetWindowLongPtr(nint hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] public static extern nint SetWindowLongPtr(nint hwnd, int index, nint value);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(nint hwnd, nint after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(nint hwnd, int command);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(nint hwnd,out RECT rect);
    [DllImport("user32.dll")] public static extern nint SetFocus(nint hwnd);
    [DllImport("user32.dll")] public static extern bool PostMessage(nint hwnd,uint msg,nint w,nint l);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from,uint to,bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern int GetSystemMetricsForDpi(int metric,uint dpi);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(nint hwnd,int attr,out RECT rect,int size);
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(nint hwnd,int attr,ref int value,int size);
    [DllImport("gdi32.dll")] public static extern nint CreateRectRgn(int l,int t,int r,int b);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(nint obj);
    [DllImport("user32.dll")] public static extern int SetWindowRgn(nint hwnd,nint region,bool redraw);
    public static nint FindWindowForProcess(int id)
    {
        nint found = 0; EnumWindows((hwnd, _) => { GetWindowThreadProcessId(hwnd, out var pid); var cls=new StringBuilder(256);GetClassName(hwnd,cls,256);if (pid == id && GetParent(hwnd) == 0 && GetWindowTextLength(hwnd)>0 && cls.ToString()=="Chrome_WidgetWin_1") { found = hwnd; return false; } return true; }, 0); return found;
    }
}
