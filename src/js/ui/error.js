/**
 * @file error.js 播放器出错时显示
 * @author yuhui<yuhui06@baidu.com>
 * @date 2017/11/16
 */
import Component from '../component';
import * as Dom from '../utils/dom';

export default class Error extends Component {
    constructor(player, options) {
        super(player, options);

        this.handleError = this.handleError.bind(this);
        this.handleClick = this.handleClick.bind(this);

        this.player.on('error', this.handleError);

        this.on('click', this.handleClick);
    }

    handleError(event, data) {
        console.log(event, data);
    }

    handleClick() {
        const src = this.player.src();
        this.player.reset();
        this.player.src(src);
    }

    createEl() {
        const errorSpinner = Dom.createElement('span', {
            className: 'lark-error-area__spinner lark-icon-loading'
        });

        const errorText = Dom.createElement('span', {
            className: 'lark-error-area__text'
        }, '加载失败，点击重试');

        const errorCnt = Dom.createElement('div', {
            className: 'lark-error-cnt'
        }, errorSpinner, errorText);

        return Dom.createElement('div', {
            className: 'lark-error-area'
        }, errorCnt);
    }
}

Component.registerComponent('Error', Error);