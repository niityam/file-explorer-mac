#import <node_api.h>
#import <Cocoa/Cocoa.h>
#import <QuickLookUI/QuickLookUI.h>

@interface QLKeyInterceptor : NSObject
@property (nonatomic, strong) id monitor;
@property (nonatomic) napi_threadsafe_function tsfn;
+ (instancetype)shared;
- (void)startWithCallback:(napi_threadsafe_function)tsfn;
- (BOOL)isPanelOpen;
@end

@implementation QLKeyInterceptor

+ (instancetype)shared {
  static QLKeyInterceptor* instance = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    instance = [[QLKeyInterceptor alloc] init];
  });
  return instance;
}

- (BOOL)isPanelOpen {
  return [QLPreviewPanel sharedPreviewPanelExists] && [[QLPreviewPanel sharedPreviewPanel] isVisible];
}

- (void)startWithCallback:(napi_threadsafe_function)tsfn {
  self.tsfn = tsfn;
  if (self.monitor) return;

  self.monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
    handler:^NSEvent*(NSEvent* event) {
      if (![self isPanelOpen]) return event;

      unsigned short code = [event keyCode];
      const char* keyName = NULL;
      if (code == 126) keyName = "ArrowUp";
      else if (code == 125) keyName = "ArrowDown";
      else if (code == 123) keyName = "ArrowLeft";
      else if (code == 124) keyName = "ArrowRight";
      else if (code == 49) keyName = "Space";
      else if (code == 53) keyName = "Escape";

      if (keyName && self.tsfn) {
        BOOL isShift = (event.modifierFlags & NSEventModifierFlagShift) != 0;
        char buffer[128];
        if (isShift) {
          snprintf(buffer, sizeof(buffer), "Shift+%s", keyName);
        } else {
          snprintf(buffer, sizeof(buffer), "%s", keyName);
        }
        char* str = strdup(buffer);
        napi_call_threadsafe_function(self.tsfn, str, napi_tsfn_nonblocking);
        return nil; // Consume key event: prevents scrolling in Word/Excel preview!
      }
      return event;
    }];
}

@end

static void CallJsCallback(napi_env env, napi_value js_cb, void* context, void* data) {
  if (env && js_cb && data) {
    char* keyName = (char*)data;
    napi_value str;
    napi_create_string_utf8(env, keyName, NAPI_AUTO_LENGTH, &str);
    napi_call_function(env, NULL, js_cb, 1, &str, NULL);
    free(keyName);
  }
}

static napi_value InitInterceptor(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

  napi_value resource_name;
  napi_create_string_utf8(env, "QLKeyInterceptor", NAPI_AUTO_LENGTH, &resource_name);

  napi_threadsafe_function tsfn;
  napi_create_threadsafe_function(env, argv[0], NULL, resource_name, 0, 1, NULL, NULL, NULL, CallJsCallback, &tsfn);
  [[QLKeyInterceptor shared] startWithCallback:tsfn];
  return NULL;
}

static napi_value IsOpen(napi_env env, napi_callback_info info) {
  napi_value res;
  napi_get_boolean(env, [[QLKeyInterceptor shared] isPanelOpen], &res);
  return res;
}

NAPI_MODULE_INIT() {
  napi_value fnInit, fnIsOpen;
  napi_create_function(env, "initInterceptor", NAPI_AUTO_LENGTH, InitInterceptor, NULL, &fnInit);
  napi_create_function(env, "isOpen", NAPI_AUTO_LENGTH, IsOpen, NULL, &fnIsOpen);
  napi_set_named_property(env, exports, "initInterceptor", fnInit);
  napi_set_named_property(env, exports, "isOpen", fnIsOpen);
  return exports;
}
