# Generates the tomato application icon (multi-size .ico) with no external tools.
# Entries are classic 32-bit DIBs so every Windows API and the shell can read it.
# Windows PowerShell 5.1 compatible.
param([string]$Out = (Join-Path $PSScriptRoot '..\app\assets\tomato.ico'))

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class TomatoIcon
{
    static Bitmap Render(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            float k = size / 64f;

            using (var body = new SolidBrush(Color.FromArgb(255, 226, 85, 63)))
            {
                g.FillEllipse(body, 12f * k, 17f * k, 40f * k, 40f * k);
            }

            using (var leaf = new SolidBrush(Color.FromArgb(255, 46, 158, 91)))
            {
                foreach (float angle in new float[] { -26f, 0f, 26f })
                {
                    GraphicsState state = g.Save();
                    g.TranslateTransform(32f * k, 17f * k);
                    g.RotateTransform(angle);
                    g.FillEllipse(leaf, -11f * k, -4.5f * k, 22f * k, 9f * k);
                    g.Restore(state);
                }
            }

            using (var pen = new Pen(Color.FromArgb(255, 46, 158, 91), Math.Max(1.4f, 2.8f * k)))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                g.DrawLine(pen, 32f * k, 21f * k, 32f * k, 12f * k);
            }
        }
        return bmp;
    }

    static byte[] Dib(Bitmap bmp)
    {
        int size = bmp.Width;
        var rect = new Rectangle(0, 0, size, size);
        BitmapData data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        var buffer = new byte[stride * size];
        System.Runtime.InteropServices.Marshal.Copy(data.Scan0, buffer, 0, buffer.Length);
        bmp.UnlockBits(data);

        int maskStride = ((size + 31) / 32) * 4;
        int maskBytes = maskStride * size;

        using (var ms = new MemoryStream())
        {
            using (var bw = new BinaryWriter(ms, System.Text.Encoding.UTF8, true))
            {
                bw.Write(40);                 // biSize
                bw.Write(size);               // biWidth
                bw.Write(size * 2);           // biHeight (XOR + AND)
                bw.Write((short)1);           // biPlanes
                bw.Write((short)32);          // biBitCount
                bw.Write(0);                  // BI_RGB
                bw.Write(size * size * 4);    // biSizeImage
                bw.Write(0);
                bw.Write(0);
                bw.Write(0);
                bw.Write(0);

                for (int y = size - 1; y >= 0; y--)
                {
                    int row = y * stride;
                    for (int x = 0; x < size; x++)
                    {
                        int p = row + x * 4;
                        bw.Write(buffer[p + 0]); // B
                        bw.Write(buffer[p + 1]); // G
                        bw.Write(buffer[p + 2]); // R
                        bw.Write(buffer[p + 3]); // A
                    }
                }

                bw.Write(new byte[maskBytes]);
            }
            return ms.ToArray();
        }
    }

    public static void Build(string path)
    {
        int[] sizes = new int[] { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        var payloads = new byte[sizes.Length][];
        for (int i = 0; i < sizes.Length; i++)
        {
            using (var bmp = Render(sizes[i]))
            {
                payloads[i] = Dib(bmp);
            }
        }

        string dir = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((short)0);
            bw.Write((short)1);
            bw.Write((short)sizes.Length);

            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                int s = sizes[i];
                byte dimension = (byte)(s >= 256 ? 0 : s);
                bw.Write(dimension);
                bw.Write(dimension);
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((short)1);
                bw.Write((short)32);
                bw.Write(payloads[i].Length);
                bw.Write(offset);
                offset += payloads[i].Length;
            }

            foreach (byte[] payload in payloads) bw.Write(payload);
        }
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing

$resolved = [System.IO.Path]::GetFullPath($Out)
[TomatoIcon]::Build($resolved)
Write-Output ("wrote {0} bytes to {1}" -f (Get-Item $resolved).Length, $resolved)
