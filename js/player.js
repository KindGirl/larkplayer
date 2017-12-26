/**
 * @file Player.js. player initial && api
 * @author yuhui06(yuhui06@baidu.com)
 * @date 2017/11/6
 */

import Html5 from './html5';
import Component from './component';
import {newGUID} from './utils/guid';
import * as Dom from './utils/dom';
import * as Events from './utils/events';
import * as Fn from './utils/fn';
import toTitleCase from './utils/to-title-case';
import fullscreen from './utils/fullscreen';
import evented from './mixins/evented';
import {each} from './utils/obj';
import * as Plugin from './utils/plugin';
import log from './utils/log';

// 确保以下代码都执行一次
import './ui/play-button';
import './ui/control-bar';
import './ui/loading';
import './ui/progress-bar-simple';
import './ui/error';

const document = window.document;

class Player extends Component {

    /**
     * 初始化一个播放器实例
     *
     * @param {Element} tag HTML5 video tag
     * @param {Object=} options 配置项。可选
     * @param {Function=} ready 播放器初始化完成后执行的函数
     */
    constructor(tag, options, ready) {
        tag.id = tag.id || `larkplayer-${newGUID()}`;

        options.initChildren = false;
        options.createEl = false;
        options.reportTouchActivity = false;
        options.id = options.id || tag.id;

        super(null, options, ready);

        this.isReady = false;

        // @todo check valid options

        this.tag = tag;

        this.el = this.createEl();

        // 使得 this 具有事件能力(on off one trigger)
        evented(this, {eventBusKey: 'el'});

        // 需放在 this.loadTech 方法前面
        this.handleLoadstart = this.handleLoadstart.bind(this);
        this.handlePlay = this.handlePlay.bind(this);
        this.handleWaiting = this.handleWaiting.bind(this);
        this.handleCanplay = this.handleCanplay.bind(this);
        this.handleCanplaythrough = this.handleCanplaythrough.bind(this);
        this.handlePlaying = this.handlePlaying.bind(this);
        this.handleSeeking = this.handleSeeking.bind(this);
        this.handleSeeked = this.handleSeeked.bind(this);
        this.handleFirstplay = this.handleFirstplay.bind(this);
        this.handlePause = this.handlePause.bind(this);
        this.handleEnded = this.handleEnded.bind(this);
        this.handleDurationchange = this.handleDurationchange.bind(this);
        this.handleTimeupdate = this.handleTimeupdate.bind(this);
        this.handleTap = this.handleTap.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
        this.handleFullscreenError = this.handleFullscreenError.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleClick = this.handleClick.bind(this);

        // 3000ms 后自动隐藏播放器控制条
        this.activeTimeout = 3000;

        // @todo ios11 在 click 上出了点问题，先注释掉，用 touchend 代替 click 方法
        // this.on('click', this.handleClick);
        // this.on('touchstart', this.handleTouchStart);

        this.on('touchend', this.handleTouchEnd);

        if (!this.tech) {
            this.tech = this.loadTech();
        }

        this.initChildren();

        this.addClass('lark-paused');
        // 如果视频已经存在，看下是不是错过了 loadstart 事件
        if (this.src()) {
            this.handleLateInit(this.tech.el);
        }

        // plugins
        const plugins = this.options.plugins;
        if (plugins) {
            Object.keys(plugins).forEach(name => {
                let plugin = Plugin.getPlugin(name);
                if (plugin) {
                    plugin.call(this, plugins[name]);
                } else {
                    throw new Error(`Plugin ${name} not exist`);
                }
            });
        }

        // 如果当前视频已经出错，重新触发一次 error 事件
        if (this.techGet('error')) {
            Events.trigger(this.tech.el, 'error');
        }

        this.triggerReady();
    }

    /**
     * 销毁播放器
     *
     */
    dispose() {
        this.trigger('dispose');
        // 避免 dispose 被调用两次
        this.off('dispose');

        // if (this.styleEl_ && this.styleEl_.parentNode) {
        //     this.styleEl_.parentNode.removeChild(this.styleEl_);
        // }

        if (this.tag && this.tag.player) {
            this.tag.player = null;
        }

        if (this.el && this.el.player) {
            this.el.player = null;
        }

        if (this.tech) {
            this.tech.dispose();
        }

        super.dispose();
    }

    /**
     * 创建播放器 DOM （将 video 标签包裹在一层 div 中，全屏及添加其他子元素时需要）
     *
     * @return {Element} el 播放器 DOM
     */
    createEl() {
        const tag = this.tag;

        // 处理 options 中的 html5 标准属性
        const html5StandardOptions = [
            'autoplay',
            // 'controls',
            'height',
            'loop',
            'muted',
            'poster',
            'preload',
            'auto',
            'metadata',
            'none',
            'src',
            'width',
            'playsinline'
        ];
        each(this.options, (value, key) => {
            if (html5StandardOptions.includes(key)) {
                Dom.setAttribute(tag, key, value);
            }
        });

        if (this.options.source) {
            // 等到 this.tech 初始化完成后再添加
            this.ready(() => {
                this.source(this.options.source);
            });
        }

        // 为 video 创建一个父元素，并将 video 的属性全部加在父元素上
        // 将子元素的 id 转移到父元素上
        let el = Dom.createEl('div', null, Dom.getAttributes(tag));

        // 为父元素添加 larkplayer class
        Dom.addClass(el, 'larkplayer');

        Dom.setAttribute(el, 'tabindex', '-1');
        Dom.setAttribute(tag, 'tabindex', '-1');

        // 子元素原来的 id 加上 -larkplayer 后缀
        if (tag.id) {
            tag.id += '-larkplayer';
        }

        // 将原生控制条移除
        // 目前只支持使用自定义的控制条
        tag.removeAttribute('controls');

        // 将 el 插入到 DOM 中
        if (tag.parentNode) {
            tag.parentNode.insertBefore(el, tag);
        }

        // 父元素的 width height 样式继承子元素的值
        // 将 video 标签的 width height 属性移除，确保 width height 为 100%
        if (tag.hasAttribute('width')) {
            let tagWidth = tag.getAttribute('width');
            el.style.width = tagWidth + 'px';
            tag.removeAttribute('width');
        }

        if (tag.hasAttribute('height')) {
            let tagHeight = tag.getAttribute('height');
            el.style.height = tagHeight + 'px';
            tag.removeAttribute('height');
        }


        // @todo safari 好像不支持移动 video DOM?
        // 将 video 插入到 el 中
        el.appendChild(tag);

        return el;
    }

    handleLateInit(el) {
        // readyState
        // 0 - HAVE_NOTHING
        // 没有任何资源可供播放，如果 networkState 的状态是 NETWORK_EMPTY 那么 readyState 的状态一定是 HAVE_NOTHING
        // 1 - HAVE_METADATA
        // 视频时长、尺寸已经获取到。这时候还没有可播放的数据，但是跳转到指定时长时播放器不会抛出错误
        // 2 - HAVE_CURRENT_DATA
        // 当前帧的播放没有问题，但是不保证后续可以顺畅播放
        // HAVE_CURRENT_DATA 与 HAVE_METADATA 的区别可以忽略不计
        // 3 - HAVE_FUTURE_DATA
        // 当前帧可以播放，后面的一点也可以播放
        // 一定不是处于最后一帧
        // 4 - HAVE_ENOUGH_DATA
        // 已经全部缓冲完或者照目前的速度播放下去不会有问题

        if (el.networkState === 0 || el.networkState === 3) {
            return;
        }

        // 在 readyState === 0 的时候，loadstart 事件也有可能已经触发了
        // NetworkState is set synchronously BUT loadstart is fired at the
        // end of the current stack, usually before setInterval(fn, 0).
        // So at this point we know loadstart may have already fired or is
        // about to fire, and either way the player hasn't seen it yet.
        // We don't want to fire loadstart prematurely here and cause a
        // double loadstart so we'll wait and see if it happens between now
        // and the next loop, and fire it if not.
        // HOWEVER, we also want to make sure it fires before loadedmetadata
        // which could also happen between now and the next loop, so we'll
        // watch for that also.
        if (el.readyState === 0) {
            let loadstartFired = false;
            const setLoadstartFired = function () {
                loadstartFired = true;
            };

            this.on('loadstart', setLoadstartFired);

            const triggerLoadstart = function () {
                if (!loadstartFired) {
                    this.trigger('loadstart');
                }
            };

            // 确保在执行 loadedmetadata 之前，执行了 loadstart 事件
            this.on('loadedmetadata', triggerLoadstart);

            // 我们的目标是，错过了 loadstart 的话，在 ready 后再手动 trigger 一次
            this.ready(() => {
                this.off('loadstart', setLoadstartFired);
                this.off('loadedmetadata', triggerLoadstart);

                if (!loadstartFired) {
                    this.trigger('loadstart');
                }
            });

            return;
        }

        const eventsToTrigger = ['loadstart', 'loadedmetadata'];

        if (el.readyState >= 2) {
            eventsToTrigger.push('loadeddata');
        }

        if (el.readyState >= 3) {
            eventsToTrigger.push('canplay');
        }

        if (el.readyState >= 4) {
            eventsToTrigger.push('canplaythrough');
        }

        this.ready(() => {
            eventsToTrigger.forEach(event => {
                this.trigger(event);
            });
        });
    }

    // 创建一个 Html5 实例
    loadTech() {
        this.options.el = this.tag;
        let tech = new Html5(this.player, this.options);

        // 注册 video 的各个事件
        [
            // 'loadstart',
            'suspend',
            'abort',
            // 'error',
            'emptied',
            'stalled',
            'loadedmetadata',
            'loadeddata',
            // 'canplay',
            // 'canplaythrough',
            // 'playing',
            // 'waiting',
            // 'seeking',
            // 'seeked',
            // 'ended',
            // 'durationchange',
            // 'timeupdate',
            'progress',
            // 'play',
            // 'pause',
            'ratechange',
            'resize',
            'volumechange'
        ].forEach(event => {
            // 对于我们不做任何处理的事件，直接 trigger 出去，提供给用户就行了
            Events.on(tech.el, event, () => {
                this.trigger(event);
            });
        });

        // 如果我们要先对事件做处理，那先走我们自己的 handlexxx 函数
        [
            'loadstart',
            'canplay',
            'canplaythrough',
            'error',
            'playing',
            'timeupdate',
            'waiting',
            'seeking',
            'seeked',
            'ended',
            'durationchange',
            'play',
            'pause'
        ].forEach(event => {
            Events.on(tech.el, event, this[`handle${toTitleCase(event)}`]);
        });


        // 绑定 firstPlay 事件
        // 先 off 确保只绑定一次
        this.off('play', this.handleFirstplay);
        this.one('play', this.handleFirstplay);

        // 全屏事件
        Events.on(tech.el, 'fullscreenchange', this.handleFullscreenChange);
        fullscreen.fullscreenchange(this.handleFullscreenChange);
        fullscreen.fullscreenerror(this.handleFullscreenError);

        return tech;
    }

    techGet(method) {
        return this.tech[method]();
    }

    techCall(method, val) {
        try {
            this.tech[method](val);
        } catch (ex) {
            log(ex);
        }
    }

    width(value) {
        return this.dimension('width', value);
    }

    height(value) {
        return this.dimension('height', value);
    }

    dimension(dimension, value) {
        const privateDimension = dimension + '_';

        if (value === undefined) {
            return this[privateDimension] || 0;
        }

        if (value === '') {
            this[privateDimension] = undefined;
        } else {
            const parsedVal = parseFloat(value);
            if (isNaN(parsedVal)) {
                log(`Improper value ${value} supplied for ${dimension}`);
                return;
            }

            this[privateDimension] = parsedVal;
        }

        // this.updateStyleEl_();
    }

    // @dprecated
    // videojs 中的方法，目前没用到
    hasStart(hasStarted) {
        if (hasStarted !== undefined) {
            if (this.hasStarted !== hasStarted) {
                this.hasStarted = hasStarted;
                if (hasStarted) {
                    this.addClass('lark-has-started');
                    this.trigger('firstplay');
                } else {
                    this.removeClass('lark-has-started');
                }
            }
            return;
        }

        return !!this.hasStarted;
    }

    // = = = = = = = = = = = = = 事件处理 = = = = = = = = = = = = = =

    handleLoadstart() {
        this.addClass('lark-loadstart');

        this.trigger('loadstart');
    }

    handlePlay() {
        // @todo removeClass 支持一次 remove 多个 class
        this.removeClass('lark-loadstart');
        this.removeClass('lark-ended');
        this.removeClass('lark-paused');
        this.removeClass('lark-error');
        this.removeClass('lark-seeking');
        this.removeClass('lark-waiting');
        this.addClass('lark-playing');


        this.trigger('play');
    }

    handleWaiting() {
        this.addClass('lark-waiting');

        this.trigger('waiting');
        // 处于 waiting 状态后一般都会伴随一次 timeupdate，即使那之后视频还是处于卡顿状态
        // this.one('timeupdate', () => this.removeClass('lark-waiting'));
    }

    handleCanplay() {
        this.removeClass('lark-waiting');

        this.trigger('canplay');
    }

    handleCanplaythrough() {
        this.removeClass('lark-waiting');

        this.trigger('canplaythrough');
    }

    handlePlaying() {
        this.removeClass('lark-waiting');
        this.removeClass('lark-loadstart');

        this.trigger('playing');
    }

    handleSeeking() {
        this.addClass('lark-seeking');

        this.trigger('seeking');
    }

    handleSeeked() {
        this.removeClass('lark-seeking');

        this.trigger('seeked');
    }

    handleFirstplay() {
        // @todo 不清楚有什么用
        this.addClass('lark-has-started');

        //
        this.addClass('lark-user-active');
        this.activeTimeoutHandler = setTimeout(() => {
            this.removeClass('lark-user-active');
        }, this.activeTimeout);

        this.trigger('firstplay');
    }

    handlePause() {
        this.removeClass('lark-playing');
        this.addClass('lark-paused');

        this.trigger('pause');
    }

    handleEnded() {
        this.addClass('lark-ended');

        // 如果播放器自动循环了，在 chrome 上不会触发 ended 事件
        // @todo 待验证其他浏览器
        if (this.options.loop) {
            this.currentTime(0);
            this.play();
        } else if (!this.paused()) {
            this.pause();
        }

        this.trigger('ended');
    }

    handleDurationchange() {
        let data = {
            duration: this.techGet('duration')
        };

        this.trigger('durationchange', data);
    }

    handleTimeupdate() {
        let data = {
            currentTime: this.techGet('currentTime')
        };
        // data.currentTime = this.techGet('currentTime');

        this.trigger('timeupdate', data);
    }

    handleTap() {

    }

    handleTouchStart(event) {
        const activeClass = 'lark-user-active';
        // 当控制条显示并且手指放在控制条上时
        if (this.hasClass(activeClass)) {
            if (Dom.parent(event.target, 'lark-play-button')
                || Dom.parent(event.target, 'lark-control-bar')) {

                clearTimeout(this.activeTimeoutHandler);
            }

            Events.on(document, 'touchmove', this.handleTouchMove);
            Events.on(document, 'touchend', this.handleTouchEnd);
        }
    }

    handleTouchMove(event) {

    }

    handleTouchEnd(event) {
        // const activeClass = 'lark-user-active';
        // clearTimeout(this.activeTimeoutHandler);

        // this.activeTimeoutHandler = setTimeout(() => {
        //     this.removeClass(activeClass);
        // }, this.activeTimeout);

        // Events.off(document, 'touchmove', this.handleTouchMove);
        // Events.off(document, 'touchend', this.handleTouchEnd);

        // @todo 临时将 click 事件转移到 touchend，ios 11 下 click 事件目前有问题
        // 处于暂停状态时，点击播放器任何位置都均继续播放
        if (this.paused()) {
            this.play();
        }

        clearTimeout(this.activeTimeoutHandler);

        const activeClass = 'lark-user-active';

        // 点在播放按钮或者控制条上，（继续）展现控制条
        let clickOnControls = false;
        // @todo 处理得不够优雅
        if (Dom.parent(event.target, 'lark-play-button')
            || Dom.parent(event.target, 'lark-control-bar')) {

            clickOnControls = true;
        }

        if (!clickOnControls) {
            this.toggleClass(activeClass);
        }

        if (this.hasClass(activeClass)) {
            this.activeTimeoutHandler = setTimeout(() => {
                this.removeClass(activeClass);
            }, this.activeTimeout);
        }
    }

    // Html5 中会处理一次这个事件，会传入 extData
    handleFullscreenChange(event, extData = {}) {
        let data = {};

        if (extData.isFullscreen !== undefined) {
            this.isFullscreen(extData.isFullscreen);
        }

        if (this.isFullscreen()) {
            data.isFullscreen = true;
            this.addClass('lark-fullscreen');
        } else {
            data.isFullscreen = false;
            this.removeClass('lark-fullscreen');
            // lark-fullscreen-adjust 本应该在 exitFullscreen 函数中调用，但用户可能按 ESC 返回，不会走到 exitFullscreen 函数
            this.removeClass('lark-fullscreen-adjust');
        }

        this.trigger('fullscreenchange', data);
    }

    handleFullscreenError() {
        this.trigger('fullscreenerror');
    }

    handleError(event) {
        this.removeClass('lark-playing');
        // this.removeClass('lark-seeking');
        this.addClass('lark-error');

        this.trigger('error', this.techGet('error'));
    }

    handleClick(event) {
        // 处于暂停状态时，点击播放器任何位置都均继续播放
        if (this.paused()) {
            this.play();
        }

        clearTimeout(this.activeTimeoutHandler);

        const activeClass = 'lark-user-active';

        // 点在播放按钮或者控制条上，（继续）展现控制条
        let clickOnControls = false;
        // @todo 处理得不够优雅
        if (Dom.parent(event.target, 'lark-play-button')
            || Dom.parent(event.target, 'lark-control-bar')) {

            clickOnControls = true;
        }

        if (!clickOnControls) {
            this.toggleClass(activeClass);
        }

        if (this.hasClass(activeClass)) {
            this.activeTimeoutHandler = setTimeout(() => {
                this.removeClass(activeClass);
            }, this.activeTimeout);
        }
    }


    // = = = = = = = = = = = = = 对外 api = = = = = = = = = = = = = =

    // = = = func = = =

    isFullscreen(isFs) {
        if (isFs !== undefined) {
            this.fullscreenStatus = isFs;
        } else {
            return this.fullscreenStatus;
        }
    }

    requestFullscreen() {
        this.isFullscreen(true);

        if (fullscreen.fullscreenEnabled()) {
            // 利用 css 强制设置 top right bottom left margin 的值为 0
            // 避免因为定位使得元素全屏时看不到
            // 应该不会出现什么问题
            this.addClass('lark-fullscreen-adjust');
            fullscreen.requestFullscreen(this.el);
        } else if (this.tech.supportsFullScreen()) {
            this.techGet('enterFullScreen');
        } else {
            this.enterFullWindow();
            this.trigger('fullscreenchange');
        }
    }

    exitFullscreen() {
        this.isFullscreen(false);

        if (fullscreen.fullscreenEnabled() && fullscreen.isFullscreen()) {
            this.removeClass('lark-fullscreen-adjust');
            fullscreen.exitFullscreen();
        } else if (this.tech.supportsFullScreen()) {
            this.techGet('exitFullScreen');
        } else {
            this.exitFullWindow();
            this.trigger('fullscreenchange');
        }
    }

    enterFullWindow() {
        this.addClass('lark-full-window');
    }

    fullWindowOnEscKey() {

    }

    exitFullWindow() {
        this.removeClass('lark-full-window');
    }

    play() {
        if (!this.src()) {
            log.warn('No video src applied');
            return;
        }

        // changingSrc 现在用不上，后面支持 source 的时候可能会用上
        if (this.isReady && this.src()) {
            // play 可能返回一个 Promise
            const playReturn = this.techGet('play');
            if (playReturn && playReturn.then) {
                playReturn.then(null, err => {
                    // @todo 这里返回的 err 可以利用下？
                    log.error(err);
                });
            }
        }
    }

    pause() {
        this.techCall('pause');
    }

    load() {
        this.techCall('load');
    }

    // reset video and ui
    // @todo 感觉这个 reset 有点费事而且费性能
    /**
     * 重置播放器
     * 会移除播放器的 src source 属性，并重置各 UI 样式
     */
    reset() {
        this.pause();

        // reset video tag
        this.techCall('reset');

        // reset ui
        this.children.forEach(child => {
            child && child.reset && child.reset();
        });
    }

    // = = = get attr = = =

    /**
     * 判断当前是否是暂停状态
     *
     * @return {boolean} 当前是否是暂停状态
     */
    paused() {
        return this.techGet('paused');
    }

    /**
     * 获取已播放时长
     *
     * @return {number} 当前已经播放的时长，以秒为单位
     */
    played() {
        return this.techGet('played');
    }

    scrubbing(isScrubbing) {

    }

    /**
     * 获取／设置 当前时间
     *
     * @param {number=} seconds 秒数，可选。
     *                  传参则设置视频当前时刻
     *                  不传参，则获取视频当前时刻
     * @return {number|undefined} 不传参时返回视频当前时刻；传参数时设置视频当前时刻，返回 undefined
     */
    currentTime(seconds) {
        if (seconds !== undefined) {
            this.techCall('setCurrentTime', seconds);
        } else {
            return this.techGet('currentTime') || 0;
        }
    }

    // @todo duration 可以设置？
    duration() {
        return this.techGet('duration');
    }

    remainingTime() {
        return this.duration() - this.currentTime();
    }

    buffered() {
        return this.techGet('buffered');
    }

    bufferedPercent() {

    }

    bufferedEnd() {
        const buffered = this.buffered();
        const duration = this.duration();
        if (buffered && duration) {
            return buffered.end(buffered.length - 1) === duration;
        } else {
            return false;
        }
    }

    seeking() {
        return this.techGet('seeking');
    }

    seekable() {
        return this.techGet('seekable');
    }

    ended() {
        return this.techGet('ended');
    }

    networkState() {
        return this.techGet('networkState');
    }

    videoWidth() {
        return this.techGet('videoWidth');
    }

    videoHeight() {
        return this.techGet('videoHeight');
    }

    // = = = set && get attr= = =

    volume(decimal) {
        if (decimal !== undefined) {
            this.techCall('setVolume', Math.min(1, Math.max(decimal, 0)));
        } else {
            return this.techGet('volume');
        }
    }

    src(src) {
        if (src !== undefined) {
            if (src !== this.techGet('src')) {
                // 应该先暂停一下比较好
                this.techCall('pause');
                this.techCall('setSrc', src);

                // src 改变后，重新绑定一次 firstplay 方法
                // 先 off 确保只绑定一次
                this.off('play', this.handleFirstplay);
                this.one('play', this.handleFirstplay);
            }
        } else {
            return this.techGet('src');
        }
    }

    /**
     * 获取播放器 source 数据或者设置 source 标签
     *
     * @param {Array=} source 视频源，可选
     * @return {Array|undefined} 若不传参则获取 source 数据；传参则设置 source 标签，返回 undefined
     */
    source(source) {
        if (source !== undefined) {
            this.techCall('source', source);
        } else {
            return this.techGet('source');
        }
    }

    playbackRate(playbackRate) {
        if (playbackRate !== undefined) {
            this.techCall('setPlaybackRate', playbackRate);
        } else if (this.tech && this.tech.featuresPlaybackRate) {
            return this.techGet('playbackRate');
        } else {
            return 1.0;
        }
    }

    defaultPlaybackRate(defaultPlaybackRate) {
        if (defaultPlaybackRate !== undefined) {
            this.techCall('setDefaultPlaybackRate', defaultPlaybackRate);
        } else if (this.tech && this.tech.featuresPlaybackRate) {
            return this.techGet('defaultPlaybackRate');
        } else {
            return 1.0;
        }
    }

}

[
    /**
     * 设置或获取 muted 属性的值
     *
     * @param {boolean=} isMuted（静音） 可选。设置 muted 属性的值
     * @return {undefined|boolean} undefined 或 当前 muted 属性值
     */
    'muted',

    /**
     * 设置或获取 defaultMuted（默认静音） 属性的值
     *
     * @param {boolean=} isDefaultMuted 可选。设置 defaultMuted 属性的值
     * @return {undefined|boolean} undefined 或 当前 defaultMuted 的值
     */
    'defaultMuted',

    /**
     * 设置或获取 autoplay（自动播放，大多数移动端浏览器不允许视频自动播放） 属性的值
     *
     * @param {boolean=} isAutoplay 可选。设置 autoplay 属性的值
     * @return {undefined|boolean} undefined 或 当前 autoplay 值
     */
    'autoplay',

    /**
     * 设置或获取 loop（循环播放） 属性的值
     *
     * @param {boolean=} isLoop 可选。设置 loop 属性的值
     * @return {undefined|boolean} undefined 或 当前 loop 值
     */
    'loop',
    /**
     * 设置或获取 playsinline（是否内联播放，ios10 以上有效） 属性的值
     *
     * @param {boolean=} isPlaysinline 可选。设置 playsinline 属性的值
     * @return {undefined|boolean} undefined 或 当前 playsinline 值
     */
    'playsinline',

    /**
     * 设置或获取 poster（视频封面） 属性的值
     *
     * @param {string=} poster 可选。设置 poster 属性的值
     * @return {undefined|string} undefined 或 当前 poster 值
     */
    'poster',

    /**
     * 设置或获取 preload（预加载的数据） 属性的值
     *
     * @param {string=} preload 可选。设置 preload 属性的值（none、auto、metadata）
     * @return {undefined|string} undefined 或 当前 preload 值
     */
    'preload'
].forEach(prop => {
    // 这里别用箭头函数，不然 this 就指不到 Player.prototype 了
    Player.prototype[prop] = function (val) {
        if (val !== undefined) {
            this.techCall(`set${toTitleCase(prop)}`, val);
            this.options[prop] = val;
        } else {
            this.techGet(prop);
        }
    };
});

Player.prototype.options = {
    children: [
        'playButton',
        'progressBarSimple',
        'controlBar',
        'loading',
        'error'
    ]
};

export default Player;


































