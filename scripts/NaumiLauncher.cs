using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class NaumiLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 2)
        {
            try
            {
                var start = new ProcessStartInfo
                {
                    FileName = args[0],
                    Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + args[1] + "\"",
                    WorkingDirectory = Path.GetDirectoryName(args[1]),
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var process = Process.Start(start))
                {
                    process.WaitForExit();
                    if (process.ExitCode == 0)
                        return 0;
                }
            }
            catch (System.ComponentModel.Win32Exception) { }
        }

        MessageBox.Show("无法启动 Naumi。请检查 PowerShell 和桌面运行时是否可用。", "Naumi",
            MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}
