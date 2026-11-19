Pod::Spec.new do |s|
  s.name           = 'WFGameCenter'
  s.version        = '1.0.0'
  s.summary        = 'Game Center leaderboards for Word Fury'
  s.description    = 'Signs in to Game Center, submits scores and reads leaderboard entries.'
  s.author         = 'Word Fury'
  s.homepage       = 'https://wordfury.app'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'GameKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
