# Microsoft Visual C++ Runtime

Windows release packages include the x64 Visual C++ redistributable DLLs from
the Visual Studio installation used to build Klip. The DLLs retain Microsoft's
embedded version information and signatures.

`scripts/prepare-windows-runtime.ps1` copies these files from
`VC/Redist/MSVC/<version>/x64/Microsoft.VC*.CRT`. Tauri runs this script before
building Windows release packages. Generated DLLs are not stored in Git.

Redistribution information:
https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files

These runtime files remain subject to Microsoft's applicable license terms.
