require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RichTextEditor"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/jkiranc/newrepo"
  s.license      = package["license"]
  s.authors      = "react-native-fabric-rich-text contributors"

  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/jkiranc/newrepo.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  # Wires up Fabric codegen + React-Core dependencies for the New Architecture.
  install_modules_dependencies(s)
end
