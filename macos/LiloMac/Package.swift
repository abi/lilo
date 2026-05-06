// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "LiloMac",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "LiloMac", targets: ["LiloMac"]),
    ],
    targets: [
        .executableTarget(name: "LiloMac"),
    ]
)
